# Invest Sema

## Overview
Sema's public investing publication: monthly long reads, weekly setups/ideas, and a live
feed from his Telegram channel (@investsyoma). Free for readers. Apple-inspired design
(New York headings, Inter body, light + true-black dark mode). Built so paid tiers /
member login can be added later without a rewrite.

## Live URLs
| Environment | URL |
|-------------|-----|
| Live | https://lopushokbot.github.io/invest-sema/ (after first deploy) |
| GitHub | https://github.com/lopushokbot/invest-sema (created at deploy time) |
| Local path | /Users/iibot/Documents/ppppp/workspace/invest-sema/ |
| Local preview | `npx astro preview --port 4322` → http://localhost:4322/invest-sema/ |

## Tech Stack
- **Astro 5** (static output) + @astrojs/mdx, @astrojs/rss, @astrojs/sitemap
- No client framework — vanilla JS islands (theme toggle, scroll reveal, chart tooltips, filters)
- Fonts bundled in `public/fonts/`: New York (woff2, converted from ~/Library/Fonts via fontTools) + InterVariable
- Chart palette from the dataviz skill's reference palette, validated on this site's surfaces (light #ffffff, dark #101012), capped at 4 series

## Architecture
```
invest-sema/
├── astro.config.mjs        — site/base config (base: /invest-sema, trailingSlash always)
├── src/
│   ├── lib/config.ts       — SITE constants (name, telegram channel), url() base helper
│   ├── lib/telegram.ts     — build-time scrape of t.me/s/investsyoma (fails soft → CTA card)
│   ├── content.config.ts   — collections: longreads, setups (zod schemas)
│   ├── content/longreads/  — monthly pieces (.md or .mdx)
│   ├── content/setups/     — weekly pieces (.md)
│   ├── layouts/Base.astro  — head/SEO/OG, header, footer, theme + reveal scripts
│   ├── layouts/Article.astro — article shell (hero, cover, prose, share footer)
│   ├── components/         — Chart, Gallery, LongReadCard, SetupCard, TelegramStrip
│   └── pages/              — index, longreads/, setups/, telegram, about, 404, rss.xml
├── scripts/
│   ├── ingest.mjs          — Telegram → site ingestion (pull|mark|list), no creds
│   ├── seen.json           — committed state: ids already handled (published or skipped)
│   ├── PUBLISH_PLAYBOOK.md  — exact procedure the daily publishing agent follows
│   └── .cache/             — transient pending.json (gitignored)
├── public/fonts|covers|images|og-default.png|robots.txt|favicon.svg
└── .github/workflows/deploy.yml — build + Pages deploy on push, daily 05:00 UTC, manual
```

## Data Sources
- **Telegram feed**: `https://t.me/s/investsyoma` scraped at build time (regex over the
  public preview page — no API key). Returns [] on any failure; UI falls back to a
  subscribe card. Feed freshness = last build; daily scheduled build keeps it ≤24h old.
- **Auto-publish ingestion** (`scripts/ingest.mjs`): same public-preview scrape, but for
  turning new posts into content. `pull` keys on `data-post` (ignores album-child media
  ids), dedups against every content file's footer link + `seen.json`, downloads photos to
  `public/images/tg/<id>.jpg`, writes `scripts/.cache/pending.json`. The daily agent reads
  that manifest and follows `scripts/PUBLISH_PLAYBOOK.md` to categorize + publish verbatim,
  then `mark`s the ids. No bot, no token — Sema just posts to Telegram as usual.

## Deployment
- **Status: NOT yet deployed — Sema reviews locally first, deploy only after his OK.**
- Deploy = create GitHub repo `lopushokbot/invest-sema`, push, enable Pages (GitHub
  Actions source). Workflow `.github/workflows/deploy.yml` does build + deploy on push
  to main, daily at 05:00 UTC (09:00 Dubai, refreshes Telegram feed), and manual dispatch.

## Known Issues & Gotchas
- `npx astro build` must run **from the project dir** — from elsewhere npx resolves a
  bare vite and errors with a confusing stack.
- Font CSS uses absolute `/invest-sema/fonts/...` URLs (global.css can't use the url()
  helper). If the base path ever changes, update `src/styles/global.css` @font-face too.
- `src/lib/telegram.ts` sanitizer uses control-char sentinels (0x01–0x05) — they are
  intentional, invisible in editors; don't "clean them up".
- Telegram post photos hotlink Telegram's CDN (`cdn*.telegram-org`) with
  `referrerpolicy="no-referrer"` — if they ever break, drop the photo block; text posts
  are unaffected.
- Charts require `.mdx` (import Chart component); plain `.md` handles text + images.
- **All content = Sema's real Telegram posts, VERBATIM (his explicit instruction —
  "don't write long reads, just post them as they are").** Russian text untouched;
  photos from the original posts live in `public/images/tg/<postid>.jpg`; each entry
  ends with a link to the original t.me post.
- **Content rule (Sema's, updated 2026-07-23): classify by SUBSTANCE, not a fixed
  count.** A **long read** = a substantial analysis / deep-dive / how-to (roughly
  150+ words). A **setup** = a shorter take, call, review, or news note (type: Trade
  idea / Watchlist / Quick take, by content). **A month can have several long reads
  (April has 2: #300 US + #301 Russia) or none** — don't force one-per-month. Only
  investing content is published; lifestyle / travel / business-club revenue / memes /
  pure-photo posts are skipped (but still marked in seen.json). Text stays verbatim.
- Long reads: Oct'25 #258 #260 #262, Nov'25 #266, Jan'26 #274, Feb'26 #277 #282,
  Apr'26 #300 #301, Jul'26 #309. Setups: Dec'24 #118 #119 #126, Apr'25 #128 #184,
  Oct'25 #253 #263 #264 #265, Nov'25 #206, Jan'26 #271 #272, Feb'26 #278 #279, Apr'26 #306.
- **Sema's call overrides the word-count heuristic.** He can designate an image-heavy
  short post as a long read (e.g. #266 crypto-watchlist screenshot, #274 Trump/Greenland
  screenshot) — the picture carries the substance. When he names a post as a long read,
  move it to longreads/ verbatim regardless of length, keep its real date. His mid-July
  date references can be off — match by the described image/topic, not the stated date.
- **Display (Sema's preferred):** Long Reads page is **grouped by month** (header +
  "N long read(s)" count). Each long read is a **big box** showing its EXACT date
  (formatDate): a month with 1 → full-width box, 2 → side by side, 3 → wrap
  (`.lr-grid` = `repeat(auto-fit,minmax(440px,1fr))`). Home leads with "THE LONG READ ·
  [latest month]" and that month's big box(es). Setups use the smaller card
  (`minmax(300px,1fr)`). Two card styles total: big long-read box + compact setup card.
  Long-read article eyebrow is just "Long Read" (byline carries the exact date).
- **Markets:** every post has a `markets` frontmatter array from {US, Crypto, Russia}
  (the 3 markets Sema covers). Both Long Reads and Setups have filter buttons
  (All + 3). Defined once in `MARKETS` (config.ts). Set markets in the admin's
  multi-select. A post can have several; none = shows only under "All".
- **Logo:** `public/logo.png` (transparent, Sema's arrow/candles mark) in header +
  footer + favicon + OG card. If replacing, drop a new mark and re-run the bg-removal
  (see RUNBOOK v5 changelog) to keep it transparent for dark mode.
- About page: Sema's own copy (title "(Hopefully) Useful thoughts about markets", intro,
  "How I think", "The fine print"). "My small investment-related projects" section has 4
  cards — DeFi Course, Stablecoin APY Dashboard, Russian Portfolio Dashboard, DeFi Alpha
  Chat — links in `SITE.projects` (config.ts). About is in the nav.
- Setups page is **month-grouped** (header + count), same as Long Reads.
- **Admin panel (Sema self-serve): Sveltia CMS at `public/admin/`** — two sections
  (Long Reads, Weekly Setups). Local editing via `Invest Sema Admin.command` ("Work with
  Local Repository", Chrome FS Access, no login); hosted editing via GitHub PAT after
  deploy ("Sign In Using Access Token"), publish = commit = auto-deploy. No OAuth
  worker. `assetUrl()` resolves CMS-uploaded image paths. See RUNBOOK "Admin panel".
