/**
 * Build-time fetch of the latest public posts from the Telegram channel.
 * Parses t.me/s/<channel> (the public preview page). Fails soft: on any
 * error the site still builds and the Telegram sections fall back to a
 * subscribe CTA. The feed refreshes on every deploy + a daily scheduled build.
 */
import { SITE } from './config';

export interface TgPost {
  id: string;
  text: string;
  html: string;
  date: Date;
  link: string;
  views: string | null;
  photo: string | null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  ).trim();
}

/**
 * Keep only safe inline formatting (b/i/br), drop everything else.
 * Control-char sentinels (never present in real post text) mark the tags
 * while all other markup is stripped, then convert back to safe tags.
 */
function sanitizeInline(html: string): string {
  const BR = '';
  const BO = '';
  const BC = '';
  const IO = '';
  const IC = '';
  const text = html
    .replace(/<br\s*\/?>/gi, BR)
    .replace(/<b>/gi, BO)
    .replace(/<\/b>/gi, BC)
    .replace(/<i>/gi, IO)
    .replace(/<\/i>/gi, IC)
    .replace(/<[^>]+>/g, '');
  return decodeEntities(text)
    .replaceAll(BR, '<br>')
    .replaceAll(BO, '<b>')
    .replaceAll(BC, '</b>')
    .replaceAll(IO, '<i>')
    .replaceAll(IC, '</i>')
    .trim();
}

export async function fetchTelegramPosts(limit = 6): Promise<TgPost[]> {
  if (!SITE.telegram) return [];
  try {
    const res = await fetch(`https://t.me/s/${SITE.telegram}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const page = await res.text();

    const blocks = page.split('tgme_widget_message_wrap').slice(1);
    const posts: TgPost[] = [];

    for (const block of blocks) {
      const linkM = block.match(
        new RegExp(`href="(https://t\\.me/${SITE.telegram}/(\\d+))"`, 'i')
      );
      const dateM = block.match(/datetime="([^"]+)"/);
      const textM = block.match(
        /class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/
      );
      const viewsM = block.match(
        /class="tgme_widget_message_views"[^>]*>([^<]+)</
      );
      const photoM = block.match(
        /tgme_widget_message_photo_wrap[^"]*"[^>]*background-image:url\('([^']+)'\)/
      );

      if (!linkM || !dateM) continue;
      const html = textM ? sanitizeInline(textM[1]) : '';
      const text = textM ? stripTags(textM[1]) : '';
      if (!text && !photoM) continue;

      posts.push({
        id: linkM[2],
        text,
        html,
        date: new Date(dateM[1]),
        link: linkM[1],
        views: viewsM ? viewsM[1].trim() : null,
        photo: photoM ? photoM[1] : null,
      });
    }

    posts.sort((a, b) => b.date.getTime() - a.date.getTime());
    return posts.slice(0, limit);
  } catch {
    return [];
  }
}
