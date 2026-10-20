#!/usr/bin/env node
/**
 * Invest Sema — Telegram → site ingestion.
 *
 * Reads the public channel preview (t.me/s/<channel>), finds posts that are
 * not yet on the site, downloads their photos, and writes a manifest the
 * publishing agent then turns into content files. Zero credentials, no bot.
 *
 * Usage:
 *   node scripts/ingest.mjs pull        # find new posts → scripts/.cache/pending.json (+ download photos)
 *   node scripts/ingest.mjs mark <id..> # record ids as handled (published OR intentionally skipped)
 *   node scripts/ingest.mjs list        # show what's currently seen/published (debug)
 *
 * Dedup is belt-and-suspenders:
 *   - publishedIds: scraped live from every content file's footer link (t.me/<ch>/<id>)
 *   - seen.json:    ids the agent has explicitly handled (published or skipped)
 * A post is "new" only if its id is in neither set. Album child media ids
 * (grouped under one post) are ignored — we key strictly on data-post.
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CHANNEL = 'investsyoma';
const CACHE_DIR = join(ROOT, 'scripts', '.cache');
const SEEN_FILE = join(ROOT, 'scripts', 'seen.json');
const PENDING_FILE = join(CACHE_DIR, 'pending.json');
const IMG_DIR = join(ROOT, 'public', 'images', 'tg');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';
// Keep the repo lean: clips above this stay on Telegram (the footer links there).
const VIDEO_MAX_BYTES = 25 * 1024 * 1024;

// ---- html helpers (ported from src/lib/telegram.ts) --------------------------
const decode = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

// Telegram wraps text in <div>…</div> with <br> line breaks. Turn it into
// clean plain text with real newlines (paragraph breaks preserved).
const toText = (htmlFrag) =>
  decode(
    htmlFrag
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(?:b|strong|i|em|u|s|a|span|tg-spoiler|pre|code)\b[^>]*>/gi, '')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// Inner HTML of the first <div class="<cls>…">, matched by div depth so it stops at the
// text's own closing tag — never runs on into link previews or the reactions bar.
function innerDiv(html, cls) {
  const open = html.match(new RegExp(`<div[^>]*class="${cls}\\b[^"]*"[^>]*>`));
  if (!open) return '';
  const from = open.index + open[0].length;
  const tag = /<(\/?)div\b[^>]*>/g;
  tag.lastIndex = from;
  let depth = 1;
  for (let m; (m = tag.exec(html)); ) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(from, m.index);
  }
  return html.slice(from);
}

// ---- state -------------------------------------------------------------------
async function loadSeen() {
  if (!existsSync(SEEN_FILE)) return { processed: [] };
  try {
    return JSON.parse(await readFile(SEEN_FILE, 'utf-8'));
  } catch {
    return { processed: [] };
  }
}

async function publishedIds() {
  const dirs = ['src/content/longreads', 'src/content/setups'].map((d) => join(ROOT, d));
  const ids = new Set();
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const f of await readdir(dir)) {
      if (!/\.mdx?$/.test(f)) continue;
      const body = await readFile(join(dir, f), 'utf-8');
      for (const m of body.matchAll(new RegExp(`t\\.me/${CHANNEL}/(\\d+)`, 'g'))) {
        ids.add(Number(m[1]));
      }
    }
  }
  return ids;
}

// ---- fetch + parse -----------------------------------------------------------
async function fetchPosts() {
  const res = await fetch(`https://t.me/s/${CHANNEL}`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`t.me returned ${res.status}`);
  const page = await res.text();

  const posts = [];
  for (const block of page.split('tgme_widget_message_wrap').slice(1)) {
    const idM = block.match(new RegExp(`data-post="${CHANNEL}/(\\d+)"`));
    if (!idM) continue;
    const id = Number(idM[1]);
    const dateM = block.match(/datetime="([^"]+)"/);
    const textFrag = innerDiv(block, 'tgme_widget_message_text');
    const photos = [
      ...block.matchAll(/tgme_widget_message_photo_wrap[^"]*"[^>]*background-image:url\('([^']+)'\)/g),
    ].map((m) => m[1]);
    const hasVideo = /tgme_widget_message_video\b/.test(block);
    // Short clips are served as plain mp4 in the preview — keep them with their poster frame.
    const videos = [...block.matchAll(/<video src="([^"]+)"/g)].map((m) => decode(m[1]));
    const posters = [
      ...block.matchAll(/tgme_widget_message_video_thumb[^"]*"[^>]*background-image:url\('([^']+)'\)/g),
    ].map((m) => m[1]);
    // Telegram's public preview refuses to render some media (video notes, stories,
    // paid media) — it emits "Please open Telegram to view this post" and NO text.
    // Flag those so autopublish can report them instead of silently dropping them.
    const unreadable = /message_media_not_supported/.test(block) && !textFrag;

    posts.push({
      id,
      date: dateM ? dateM[1] : null,
      text: textFrag ? toText(textFrag) : '',
      photos,
      videos,
      posters,
      hasVideo,
      unreadable,
      link: `https://t.me/${CHANNEL}/${id}`,
    });
  }
  return posts;
}

// Returns bytes written, or 0 if the file exceeds maxBytes (nothing is written).
async function download(url, dest, maxBytes = Infinity) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (Number(res.headers.get('content-length') || 0) > maxBytes) return 0;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) return 0;
  await writeFile(dest, buf);
  return buf.length;
}

// ---- commands ----------------------------------------------------------------
async function pull() {
  const [seen, published, posts] = await Promise.all([loadSeen(), publishedIds(), fetchPosts()]);
  const seenSet = new Set(seen.processed);
  const isNew = (p) => !seenSet.has(p.id) && !published.has(p.id);
  const fresh = posts.filter(isNew).sort((a, b) => a.id - b.id);

  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(IMG_DIR, { recursive: true });

  const manifest = [];
  for (const p of fresh) {
    const localPhotos = [];
    for (let i = 0; i < p.photos.length; i++) {
      const name = i === 0 ? `${p.id}.jpg` : `${p.id}-${i + 1}.jpg`;
      try {
        await download(p.photos[i], join(IMG_DIR, name));
        localPhotos.push(`/invest-sema/images/tg/${name}`);
      } catch (e) {
        console.error(`  ! photo ${p.id}#${i + 1} failed: ${e.message}`);
      }
    }
    const localVideos = [];
    for (let i = 0; i < p.videos.length; i++) {
      const name = `${p.id}-v${i + 1}`;
      try {
        const bytes = await download(p.videos[i], join(IMG_DIR, `${name}.mp4`), VIDEO_MAX_BYTES);
        if (!bytes) {
          console.error(`  ! video ${p.id}#${i + 1} too large — left on Telegram`);
          continue;
        }
        let poster = null;
        if (p.posters[i]) {
          try {
            await download(p.posters[i], join(IMG_DIR, `${name}.jpg`));
            poster = `/invest-sema/images/tg/${name}.jpg`;
          } catch {}
        }
        localVideos.push({ src: `/invest-sema/images/tg/${name}.mp4`, poster });
      } catch (e) {
        console.error(`  ! video ${p.id}#${i + 1} failed: ${e.message}`);
      }
    }
    manifest.push({
      id: p.id,
      date: p.date ? p.date.slice(0, 10) : null,
      link: p.link,
      words: p.text ? p.text.split(/\s+/).filter(Boolean).length : 0,
      hasVideo: p.hasVideo,
      unreadable: p.unreadable,
      photos: localPhotos,
      videos: localVideos,
      text: p.text,
    });
  }

  await writeFile(PENDING_FILE, JSON.stringify(manifest, null, 2));

  if (manifest.length === 0) {
    console.log(`No new posts. (latest on channel: #${Math.max(...posts.map((p) => p.id))}, all already handled)`);
  } else {
    console.log(`${manifest.length} new post(s) → ${PENDING_FILE}\n`);
    for (const m of manifest) {
      console.log(`  #${m.id}  ${m.date}  ${m.words}w  photos:${m.photos.length}${m.videos.length ? `  videos:${m.videos.length}` : m.hasVideo ? ' +video' : ''}`);
      console.log(`     ${m.text.slice(0, 90).replace(/\n/g, ' ')}${m.text.length > 90 ? '…' : ''}`);
    }
    console.log(`\nNext: the agent judges each (Long Read vs Setup), writes the content file verbatim, then runs:`);
    console.log(`  node scripts/ingest.mjs mark ${manifest.map((m) => m.id).join(' ')}`);
  }
  return manifest;
}

async function mark(ids) {
  const nums = ids.map(Number).filter((n) => Number.isFinite(n));
  if (!nums.length) return console.error('mark: pass one or more numeric ids');
  const seen = await loadSeen();
  const set = new Set([...seen.processed, ...nums]);
  seen.processed = [...set].sort((a, b) => a - b);
  await mkdir(dirname(SEEN_FILE), { recursive: true });
  await writeFile(SEEN_FILE, JSON.stringify(seen, null, 2));
  console.log(`Marked handled: ${nums.join(', ')} (${seen.processed.length} total seen)`);
}

async function list() {
  const [seen, published] = await Promise.all([loadSeen(), publishedIds()]);
  console.log('seen.json processed:', seen.processed.join(', ') || '(none)');
  console.log('published (from content):', [...published].sort((a, b) => a - b).join(', '));
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === 'pull') await pull();
  else if (cmd === 'mark') await mark(rest);
  else if (cmd === 'list') await list();
  else {
    console.log('usage: node scripts/ingest.mjs <pull|mark <id..>|list>');
    process.exit(1);
  }
} catch (e) {
  console.error('ingest failed:', e.message);
  process.exit(1);
}
