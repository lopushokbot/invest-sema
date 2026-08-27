#!/usr/bin/env node
/**
 * Invest Sema — deterministic auto-publisher (runs in GitHub Actions).
 *
 * Reads scripts/.cache/pending.json (produced by `ingest.mjs pull`) and, for each
 * new Telegram post, decides SKIP vs PUBLISH, and for PUBLISH writes a content file
 * VERBATIM (Sema's rule — his text is never altered; only frontmatter is authored).
 * Then marks every pending id as handled in seen.json.
 *
 * No LLM, no external calls — pure rules, so it's fully reproducible and runs free in CI.
 * Ambiguous/borderline posts are SKIPPED on purpose; Sema can hand-publish those via /admin.
 *
 * Usage: node scripts/autopublish.mjs   (after: node scripts/ingest.mjs pull)
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PENDING = join(ROOT, 'scripts', '.cache', 'pending.json');
const SEEN = join(ROOT, 'scripts', 'seen.json');
const CH = 'investsyoma';
const LONGREAD_MIN_WORDS = 150;
const PUBLISH_MIN_WORDS = 25;
// Posts Telegram's public preview can't render are re-checked this many runs (≈days)
// before being given up on, in case Sema edits them into readable text.
const RETRY_DAYS = 14;

// ---- lexicons (lowercase substring match on the post text) -------------------
const FIN = [
  'рынок','рынк','рынке','акци','дивиденд','облигац','ставк','инфляц','доллар','рубл',
  'евро','нефть','brent','золот','крипт','биткоин','btc','эфир','eth','монет','s&p',
  'nasdaq','индекс','фрс','ецб','цб ','отчёт','отчет','прибыл','выручк','тезис','актив',
  'инвест','трейд','спекул','купил','покупа','продаю','продал','шорт','лонг','бумаг',
  'компан','экономик','ввп','санкц','ключев','доходност','купон','фьючерс','опцион',
  'макро','капитал','мосбирж','ликвидност','баланс','позици','портфел','убыт','рост рынк',
];
const MARKET_KW = {
  US: ['s&p','nasdaq','фрс','сша','америк','nvidia','meta','apple','amazon','big tech','трамп','wall street','казначейств','treasur','us big tech'],
  Crypto: ['крипт','биткоин','btc','эфир','eth','монет','дефай','defi','альткоин','ончейн','стейбл','stable'],
  Russia: ['рф','россий','росси','рубл','мосбирж','цб рф','санкц','минфин'],
};
const TAG_KW = {
  Macro: ['ставк','инфляц','фрс','ецб','макро','ввп','нефть','доллар','санкц','золот','облигац'],
  Crypto: ['крипт','биткоин','монет','дефай','defi','эфир'],
  Equities: ['акци','s&p','отчёт','отчет','прибыл','выручк','nvidia','компан','бумаг','дивиденд'],
  Strategy: ['портфел','тезис','продаю','купил','покупа','спекул','шорт','лонг','позици'],
};
// Explicit skip patterns — service lines, promos, personal/weather chatter.
const SKIP_RE = [
  /\bpinned\b/i,
  /закину сюда свой курс/i,
  /курс по дефай/i,
  /подпиш/i, /переходи по ссылк/i, /реклам/i,
  /feels like/i, /холод/i, /погод/i,
];

const has = (t, arr) => arr.some((k) => t.includes(k));

function firstSentence(text, cap) {
  const line = text.split('\n').map((s) => s.trim()).find(Boolean) || text.trim();
  const m = line.match(/^(.{10,}?[.!?…])(\s|$)/u);
  let s = (m ? m[1] : line).trim();
  if (s.length > cap) s = s.slice(0, cap).replace(/\s+\S*$/, '').trim();
  return s.replace(/[.…]+$/, '').trim();
}
function description(text, cap) {
  const flat = text.replace(/\s+/g, ' ').trim();
  const sentences = flat.match(/[^.!?…]+[.!?…]+/gu) || [flat];
  let out = '';
  for (const s of sentences.slice(0, 3)) {
    if ((out + s).length > cap) break;
    out += s;
  }
  out = (out || flat).trim();
  if (out.length > cap) out = out.slice(0, cap).replace(/\s+\S*$/, '').trim();
  return out;
}
const yaml = (s) => s.replace(/"/g, "'").replace(/\s+/g, ' ').trim();

function pickList(text, map) {
  return Object.entries(map).filter(([, kws]) => has(text, kws)).map(([k]) => k);
}
function setupType(t) {
  if (/продаю|продал|купил|покупа|шорт|лонг|сделк|спекул|фиксирую|закрыл|открыл позиц/.test(t)) return 'Trade idea';
  if (/монет|список|подборк|watchlist|интересн|слежу|обрат(ил|ите) вниман/.test(t)) return 'Watchlist';
  return 'Quick take';
}

function decide(post) {
  const t = post.text.toLowerCase();
  const words = post.words ?? (post.text ? post.text.split(/\s+/).filter(Boolean).length : 0);
  if (post.unreadable) return { publish: false, reason: 'unreadable media', retry: true };
  if (!post.text || words < 1) return { publish: false, reason: 'empty / media-only' };
  if (SKIP_RE.some((re) => re.test(post.text))) return { publish: false, reason: 'service/promo/personal' };
  if (words < PUBLISH_MIN_WORDS) return { publish: false, reason: `too short (${words}w)` };
  if (!has(t, FIN)) return { publish: false, reason: 'no investing signal' };
  return { publish: true, longread: words >= LONGREAD_MIN_WORDS };
}

function render(post, kind) {
  const t = post.text;
  const title = firstSentence(t, 100) || `Пост #${post.id}`;
  const desc = description(t, 170);
  let markets = pickList(t.toLowerCase(), MARKET_KW);
  let tags = pickList(t.toLowerCase(), TAG_KW);
  if (!tags.length) tags = markets.includes('Crypto') ? ['Crypto'] : ['Macro'];
  const fm = ['---', `title: "${yaml(title)}"`, `description: "${yaml(desc)}"`, `date: ${post.date}`];
  if (kind === 'setup') fm.push(`type: "${setupType(t.toLowerCase())}"`);
  fm.push(`tags: [${tags.join(', ')}]`);
  fm.push(`markets: [${markets.join(', ')}]`);
  fm.push('---', '');
  const photos = (post.photos || []).map((p, i) => `\n![${yaml(firstSentence(t, 60)) || 'Иллюстрация'}](${p})`).join('');
  const footer = `\n\n---\n\n*[Оригинал поста в Telegram →](${post.link || `https://t.me/${CH}/${post.id}`})*\n`;
  return fm.join('\n') + t.trim() + photos + footer;
}

async function main() {
  if (!existsSync(PENDING)) {
    console.log('No pending.json — run `node scripts/ingest.mjs pull` first.');
    return;
  }
  const pending = JSON.parse(await readFile(PENDING, 'utf-8'));
  if (!pending.length) {
    console.log('No new posts.');
    return;
  }
  const published = [], skipped = [], retry = [];
  for (const post of pending) {
    const d = decide(post);
    if (!d.publish) {
      (d.retry ? retry : skipped).push({ id: post.id, reason: d.reason, link: post.link, date: post.date });
      continue;
    }
    const kind = d.longread ? 'longread' : 'setup';
    const dir = join(ROOT, 'src', 'content', d.longread ? 'longreads' : 'setups');
    await mkdir(dir, { recursive: true });
    const ym = (post.date || '2026-01-01').slice(0, 7);
    const file = join(dir, `${ym}-tg${post.id}.md`);
    await writeFile(file, render(post, kind));
    published.push({ id: post.id, kind, file: file.replace(ROOT + '/', '') });
  }

  // Mark handled (published AND skipped) so none resurface. Posts Telegram's preview
  // can't render are held back for RETRY_DAYS so they re-surface every run — if the
  // post is later edited into readable text it publishes itself; after that it's dropped.
  const seen = existsSync(SEEN) ? JSON.parse(await readFile(SEEN, 'utf-8')) : { processed: [] };
  const blocked = { ...(seen.blocked || {}) };
  const holding = new Set();
  for (const r of retry) {
    const rec = blocked[r.id] || { since: r.date || null, tries: 0, reason: r.reason, link: r.link };
    rec.tries += 1;
    rec.reason = r.reason;
    if (rec.tries < RETRY_DAYS) {
      blocked[r.id] = rec;
      holding.add(r.id);
    } else {
      delete blocked[r.id];
    }
  }
  for (const p of published) delete blocked[p.id];
  for (const s of skipped) delete blocked[s.id];
  const set = new Set([...(seen.processed || []), ...pending.map((p) => p.id).filter((id) => !holding.has(id))]);
  seen.processed = [...set].sort((a, b) => a - b);
  if (Object.keys(blocked).length) seen.blocked = blocked;
  else delete seen.blocked;
  await writeFile(SEEN, JSON.stringify(seen, null, 2) + '\n');

  console.log(`Published ${published.length}, skipped ${skipped.length}, needs attention ${retry.length}.`);
  for (const p of published) console.log(`  + #${p.id} → ${p.kind}  ${p.file}`);
  for (const s of skipped) console.log(`  - #${s.id} skipped (${s.reason})`);
  for (const r of retry) {
    console.log(`  ! #${r.id} NEEDS ATTENTION — ${r.reason}: Telegram's web preview returns`);
    console.log(`      "Please open Telegram to view this post" and exposes no text, so there is`);
    console.log(`      nothing to publish. Open ${r.link} in the app and hand-publish via /admin.`);
  }
}

main().catch((e) => {
  console.error('autopublish failed:', e.message);
  process.exit(1);
});
