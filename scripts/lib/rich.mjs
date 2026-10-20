/**
 * Telegram Bot API "rich message" (Bot API 10.1+) → site markdown.
 *
 * Channel posts written with Telegram's rich editor (inline photos, headings, tables…)
 * can't be read from the public t.me preview, but a bot that is an admin of the channel
 * receives them as `message.rich_message.blocks`. This turns those blocks into the same
 * markdown our content files use, keeping Sema's wording byte-for-byte and his
 * bold/italic/links. Media is fetched through the `media` callback, which returns a
 * site path (or null to drop the block).
 */

// ---- inline text -------------------------------------------------------------

// Wrap with markdown markers, keeping surrounding whitespace outside them
// ("**Hi **" doesn't render as bold; " **Hi** " does).
function wrap(s, open, close = open) {
  const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
  return m[2] ? `${m[1]}${open}${m[2]}${close}${m[3]}` : s;
}

/** RichText → markdown. */
export function rt(t) {
  if (t == null) return '';
  if (typeof t === 'string') return t;
  if (Array.isArray(t)) return t.map(rt).join('');
  const inner = () => rt(t.text);
  switch (t.type) {
    case 'bold':
      return wrap(inner(), '**');
    case 'italic':
      return wrap(inner(), '*');
    case 'strikethrough':
      return wrap(inner(), '~~');
    case 'code':
      return wrap(inner(), '`');
    case 'underline':
      return wrap(inner(), '<u>', '</u>');
    case 'marked':
      return wrap(inner(), '<mark>', '</mark>');
    case 'subscript':
      return wrap(inner(), '<sub>', '</sub>');
    case 'superscript':
      return wrap(inner(), '<sup>', '</sup>');
    case 'url':
      return t.url ? `[${inner()}](${t.url})` : inner();
    case 'email_address':
      return `[${inner()}](mailto:${plain(t.text)})`;
    case 'mention':
      return `[${inner()}](https://t.me/${(t.username || plain(t.text)).replace(/^@/, '')})`;
    case 'custom_emoji':
      return t.alternative_text || '';
    case 'mathematical_expression':
      return t.expression ? `\`${t.expression}\`` : '';
    case 'button':
    case 'anchor':
      return '';
    default:
      // spoiler, date_time, text_mention, hashtag, cashtag, phone, anchor_link, reference…
      return 'text' in t ? inner() : '';
  }
}

/** RichText → plain text (for titles, descriptions, keyword matching). */
export function plain(t) {
  if (t == null) return '';
  if (typeof t === 'string') return t;
  if (Array.isArray(t)) return t.map(plain).join('');
  if (t.type === 'custom_emoji') return t.alternative_text || '';
  if (t.type === 'mathematical_expression') return t.expression || '';
  return 'text' in t ? plain(t.text) : '';
}

// ---- blocks ------------------------------------------------------------------

const indent = (s, pad) => s.split('\n').map((l) => (l ? pad + l : l)).join('\n');
const quote = (s) => s.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n');
const cell = (c) => rt(c?.text).replace(/\|/g, '\\|').replace(/\n/g, '<br>');

function caption(c) {
  if (!c) return '';
  const text = rt(c.text ?? c).trim();
  const credit = c.credit ? rt(c.credit).trim() : '';
  return [text, credit && `— ${credit}`].filter(Boolean).join(' ');
}

/**
 * Convert blocks to markdown. `ctx.media(kind, block)` → Promise<string|null> site path.
 * Returns { md, plain } — plain is the text-only version.
 */
export async function blocksToMarkdown(blocks, ctx) {
  const md = [];
  const txt = [];
  for (const b of blocks || []) {
    const r = await block(b, ctx);
    if (r.md) md.push(r.md);
    if (r.plain) txt.push(r.plain);
  }
  return { md: md.join('\n\n'), plain: txt.join('\n\n') };
}

async function mediaMd(b, ctx) {
  const kind = b.type; // photo | video | animation
  const path = await ctx.media(kind, b);
  if (!path) return '';
  const cap = caption(b.caption);
  if (kind === 'photo') {
    const alt = (cap || ctx.alt || 'Иллюстрация').replace(/[[\]\n]/g, ' ').replace(/\*/g, '');
    return `![${alt}](${path})` + (cap ? `\n*${cap}*` : '');
  }
  const loop = kind === 'animation' ? ' autoplay loop muted' : ' controls';
  return `<video src="${path}"${loop} playsinline preload="metadata"></video>` + (cap ? `\n\n*${cap}*` : '');
}

async function block(b, ctx) {
  const p = (s) => ({ md: s, plain: '' });
  switch (b.type) {
    case 'paragraph':
      return { md: rt(b.text), plain: plain(b.text) };
    case 'heading': {
      const level = Math.min(Math.max((b.size || 1) + 1, 2), 4);
      return { md: `${'#'.repeat(level)} ${rt(b.text).trim()}`, plain: plain(b.text) };
    }
    case 'pre':
      return { md: '```' + (b.language || '') + '\n' + plain(b.text) + '\n```', plain: plain(b.text) };
    case 'footer':
      return { md: wrap(rt(b.text), '*'), plain: plain(b.text) };
    case 'divider':
      return p('---');
    case 'mathematical_expression':
      return p(b.expression ? '```\n' + b.expression + '\n```' : '');
    case 'pullquote':
    case 'expandable_blockquote': {
      const credit = b.credit ? `\n\n— ${rt(b.credit).trim()}` : '';
      return { md: quote(rt(b.text) + credit), plain: plain(b.text) };
    }
    case 'blockquote': {
      const inner = await blocksToMarkdown(b.blocks, ctx);
      const credit = b.credit ? `\n\n— ${rt(b.credit).trim()}` : '';
      return { md: quote(inner.md + credit), plain: inner.plain };
    }
    case 'list': {
      const out = [];
      const txt = [];
      let n = 0;
      for (const item of b.items || []) {
        n += 1;
        const inner = await blocksToMarkdown(item.blocks, ctx);
        const ordered = /^\d+[.)]?$/.test(item.label || '') || Number.isInteger(item.value);
        const box = item.has_checkbox ? (item.is_checked ? '[x] ' : '[ ] ') : '';
        const bullet = ordered ? `${item.value ?? (parseInt(item.label, 10) || n)}. ` : '- ';
        const body = indent(inner.md, ' '.repeat(bullet.length)).trimStart();
        out.push(bullet + box + body);
        txt.push(inner.plain);
      }
      return { md: out.join('\n'), plain: txt.join('\n') };
    }
    case 'table': {
      const rows = b.cells || [];
      if (!rows.length) return p('');
      const width = Math.max(...rows.map((r) => r.length));
      const line = (r) => '| ' + Array.from({ length: width }, (_, i) => cell(r[i])).join(' | ') + ' |';
      const headed = rows[0].every((c) => c?.is_header);
      const head = headed ? rows[0] : Array.from({ length: width }, () => ({ text: '' }));
      const body = headed ? rows.slice(1) : rows;
      const align = Array.from({ length: width }, (_, i) => {
        const a = rows[0][i]?.align;
        return a === 'center' ? ':---:' : a === 'right' ? '---:' : '---';
      });
      const md = [line(head), '| ' + align.join(' | ') + ' |', ...body.map(line)].join('\n');
      const cap = b.caption ? `\n\n*${rt(b.caption).trim()}*` : '';
      return { md: md + cap, plain: rows.map((r) => r.map((c) => plain(c?.text)).join(' ')).join('\n') };
    }
    case 'details': {
      const inner = await blocksToMarkdown(b.blocks, ctx);
      return {
        md: `<details${b.is_open ? ' open' : ''}>\n<summary>${rt(b.summary)}</summary>\n\n${inner.md}\n\n</details>`,
        plain: [plain(b.summary), inner.plain].filter(Boolean).join('\n'),
      };
    }
    case 'collage':
    case 'slideshow': {
      // Photos on consecutive lines → one paragraph → rendered as the 2-column grid.
      const items = [];
      for (const child of b.blocks || []) {
        if (['photo', 'video', 'animation'].includes(child.type)) {
          const m = await mediaMd({ ...child, caption: undefined }, ctx);
          if (m) items.push(m);
        }
      }
      const photos = items.filter((m) => m.startsWith('!['));
      const videos = items.filter((m) => !m.startsWith('!['));
      const cap = caption(b.caption);
      const md = [photos.join('\n'), ...videos, cap && `*${cap}*`].filter(Boolean).join('\n\n');
      return { md, plain: cap };
    }
    case 'photo':
    case 'video':
    case 'animation':
      return { md: await mediaMd(b, ctx), plain: caption(b.caption) };
    default:
      // map, buttons, anchor, audio, voice_note, document, thinking — nothing to show on the site
      return p('');
  }
}
