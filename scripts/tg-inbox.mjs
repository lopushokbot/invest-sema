#!/usr/bin/env node
/**
 * Invest Sema — Telegram bot inbox for "rich" channel posts.
 *
 * Posts written with Telegram's rich editor (inline photos, headings, tables…) show up
 * on the public t.me preview as "Please open Telegram to view this post" — no text.
 * A bot that is an admin of @investsyoma receives them in full via the Bot API, so this
 * script (run every 2h by .github/workflows/tg-inbox.yml) collects them:
 *
 *   node scripts/tg-inbox.mjs fetch   # getUpdates → scripts/inbox/<id>.json + media in public/images/tg/
 *                                     # writes the next offset to scripts/.cache/inbox-offset
 *   node scripts/tg-inbox.mjs ack     # confirm those updates with Telegram (run AFTER the commit is pushed,
 *                                     # so nothing is lost if the push fails — Telegram keeps updates ~24h)
 *   node scripts/tg-inbox.mjs test <updates.json>   # convert a saved getUpdates payload, no network
 *
 * ingest.mjs then prefers the inbox copy of a post over the unreadable web preview, and
 * autopublish.mjs publishes it like any other post. Token: env TG_INBOX_BOT_TOKEN
 * (GitHub secret; locally from .env). No token → exits quietly, nothing else changes.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { blocksToMarkdown, plain as richPlain } from './lib/rich.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CHANNEL = 'investsyoma';
const INBOX = join(ROOT, 'scripts', 'inbox');
const IMG_DIR = join(ROOT, 'public', 'images', 'tg');
const OFFSET_FILE = join(ROOT, 'scripts', '.cache', 'inbox-offset');
const BOT_FILE_LIMIT = 20 * 1024 * 1024; // Bot API getFile can't fetch larger files
const VIDEO_MAX_BYTES = 20 * 1024 * 1024;

async function loadToken() {
  if (process.env.TG_INBOX_BOT_TOKEN) return process.env.TG_INBOX_BOT_TOKEN.trim();
  const env = join(ROOT, '.env');
  if (!existsSync(env)) return null;
  const m = (await readFile(env, 'utf-8')).match(/^TG_INBOX_BOT_TOKEN=(.+)$/m);
  return m ? m[1].trim() : null;
}

function api(token) {
  return async (method, params = {}) => {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(params),
          signal: AbortSignal.timeout(30000),
        });
        const data = await res.json();
        if (data.ok) return data.result;
        const retryable = data.error_code === 429 || data.error_code >= 500;
        if (!retryable || attempt >= 3) throw new Error(`${method}: ${data.error_code} ${data.description}`);
        await new Promise((r) => setTimeout(r, (data.parameters?.retry_after || 2 ** attempt) * 1000));
      } catch (e) {
        if (attempt >= 3 || /^\w+: \d+ /.test(e.message)) throw e;
        await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
      }
    }
  };
}

async function download(token, call, fileId, dest) {
  const f = await call('getFile', { file_id: fileId });
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${f.file_path}`, {
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`file ${res.status}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

/** Build the inbox record for one channel post. `fetchMedia` = false in test mode. */
async function toRecord(msg, { token, call, fetchMedia }) {
  const id = msg.message_id;
  let photoN = 0;
  let videoN = 0;
  const media = async (kind, b) => {
    if (kind === 'photo') {
      // largest size that the Bot API can still hand out
      const sizes = (b.photo || []).filter((s) => !s.file_size || s.file_size <= BOT_FILE_LIMIT);
      const best = sizes.sort((a, z) => a.width * a.height - z.width * z.height).pop();
      if (!best) return null;
      photoN += 1;
      const name = photoN === 1 ? `${id}.jpg` : `${id}-${photoN}.jpg`;
      if (fetchMedia) await download(token, call, best.file_id, join(IMG_DIR, name));
      return `/invest-sema/images/tg/${name}`;
    }
    const file = b.video || b.animation;
    if (!file || (file.file_size && file.file_size > VIDEO_MAX_BYTES)) return null; // stays on Telegram
    videoN += 1;
    const name = `${id}-v${videoN}.mp4`;
    if (fetchMedia) await download(token, call, file.file_id, join(IMG_DIR, name));
    return `/invest-sema/images/tg/${name}`;
  };

  const blocks = msg.rich_message.blocks || [];
  const firstText = blocks.find((b) => b.type === 'paragraph');
  const ctx = { media, alt: firstText ? richPlain(firstText.text).slice(0, 60) : '' };
  const { md, plain } = await blocksToMarkdown(blocks, ctx);
  return {
    id,
    date: new Date(msg.date * 1000).toISOString().slice(0, 10),
    link: `https://t.me/${CHANNEL}/${id}`,
    edited: Boolean(msg.edit_date),
    markdown: md,
    text: plain,
    photos: photoN,
    videos: videoN,
  };
}

const isOurs = (msg) => msg?.chat?.username?.toLowerCase() === CHANNEL;

async function handle(updates, opts) {
  const saved = [];
  for (const u of updates) {
    const msg = u.channel_post || u.edited_channel_post;
    if (!isOurs(msg) || !msg.rich_message) continue; // plain posts are read fine from the web preview
    const rec = await toRecord(msg, opts);
    if (opts.write) await writeFile(join(INBOX, `${rec.id}.json`), JSON.stringify(rec, null, 2) + '\n');
    saved.push(rec);
  }
  return saved;
}

async function fetchCmd() {
  const token = await loadToken();
  if (!token) return console.log('tg-inbox: no TG_INBOX_BOT_TOKEN — skipping (rich posts need the bot).');
  const call = api(token);
  await mkdir(INBOX, { recursive: true });
  await mkdir(IMG_DIR, { recursive: true });
  await mkdir(dirname(OFFSET_FILE), { recursive: true });

  const updates = await call('getUpdates', {
    allowed_updates: ['channel_post', 'edited_channel_post'],
    timeout: 0,
    limit: 100,
  });
  const saved = await handle(updates, { token, call, fetchMedia: true, write: true });
  if (updates.length) await writeFile(OFFSET_FILE, String(updates.at(-1).update_id + 1));
  console.log(`tg-inbox: ${updates.length} update(s), ${saved.length} rich post(s) saved.`);
  for (const r of saved) console.log(`  #${r.id} ${r.date}${r.edited ? ' (edited)' : ''}  photos:${r.photos} videos:${r.videos}`);
}

async function ackCmd() {
  const token = await loadToken();
  if (!token || !existsSync(OFFSET_FILE)) return;
  const offset = Number(await readFile(OFFSET_FILE, 'utf-8'));
  await api(token)('getUpdates', { offset, limit: 1, timeout: 0, allowed_updates: ['channel_post', 'edited_channel_post'] });
  console.log(`tg-inbox: confirmed updates below ${offset}.`);
}

async function testCmd(file) {
  const payload = JSON.parse(await readFile(file, 'utf-8'));
  const updates = Array.isArray(payload) ? payload : payload.result;
  const saved = await handle(updates, { fetchMedia: false, write: false });
  for (const r of saved) console.log(JSON.stringify({ ...r, markdown: undefined }), '\n' + r.markdown + '\n');
}

const [cmd, arg] = process.argv.slice(2);
try {
  if (cmd === 'fetch') await fetchCmd();
  else if (cmd === 'ack') await ackCmd();
  else if (cmd === 'test') await testCmd(arg);
  else console.log('usage: node scripts/tg-inbox.mjs fetch | ack | test <updates.json>');
} catch (e) {
  console.error('tg-inbox failed:', e.message);
  process.exit(1);
}
