# Invest Sema — Runbook

> This file contains step-by-step instructions for every recurring task in this project.
> Claude: read this file before doing ANY work on this project.

## Quick Reference
| Task | Command / Steps |
|------|----------------|
| Build | `cd /Users/iibot/Documents/ppppp/workspace/invest-sema && npx astro build` |
| Preview locally | `npx astro preview --port 4322` → http://localhost:4322/invest-sema/ |
| **Admin panel (Sema self-serve)** | Double-click `Invest Sema Admin.command`, or live `/invest-sema/admin/` — see task below |
| Publish a long read | Admin → Long Reads → New, OR add file to `src/content/longreads/`, build, push |
| Publish a setup | Admin → Weekly Setups → New, OR add file to `src/content/setups/`, build, push |
| Refresh Telegram feed | Any rebuild/deploy does it (daily action also does it) |
| **Auto-publish new TG posts** | Automatic — GitHub Actions daily 23:00 Dubai (`ingest.mjs`+`autopublish.mjs`). See task below |

---

## Task: Auto-publish new Telegram posts — FULLY AUTOMATED (no action needed)

### What it does
Sema posts to @investsyoma as usual. **GitHub Actions** (`deploy.yml`, daily 19:00 UTC /
23:00 Dubai) runs `ingest.mjs pull` → `autopublish.mjs`, which categorizes new posts
(Long Read vs Setup vs skip), writes them **verbatim**, commits + pushes, and redeploys.
Nothing to run by hand. It's deterministic (no LLM) so it always behaves the same.

### How categorization works (`scripts/autopublish.mjs`)
- **SKIP** if: media-only, <25 words, matches a service/promo/weather pattern, or contains
  no finance keyword. Skipped ids are still recorded in `seen.json` so they don't resurface.
- **PUBLISH** (has finance signal + ≥25 words): title = his first sentence; description,
  tags, markets from keyword lexicons; **≥150 words → long read**, else **setup** (with a
  `type:`). Body is byte-for-byte his; photos + Telegram footer link appended.
- Borderline posts are skipped on purpose → Sema hand-publishes via `/admin` if he wants.

### To test / run on demand
`gh workflow run deploy.yml --repo lopushokbot/invest-sema` then
`gh run watch <id> --repo lopushokbot/invest-sema`. Locally you can dry-run the brain:
`npm run ingest` (writes `.cache/pending.json`) then `node scripts/autopublish.mjs`.

### Tuning
Edit the `FIN` / `MARKET_KW` / `TAG_KW` / `SKIP_RE` lexicons and `*_MIN_WORDS` at the top
of `scripts/autopublish.mjs`. Verify with the local dry-run before pushing.

### Retired
The claude.ai cloud routine `trig_01C24ejwKJ1Sa8QAPQXXsNa2` is **disabled** — it could not
push to the repo and its runs weren't observable. Do not re-enable; CI is the mechanism.

---

## Admin panel (Sveltia CMS) — how Sema posts himself

The panel lives at `public/admin/` (config in `public/admin/config.yml`). Two sections:
**Long Reads** → `src/content/longreads/`, **Weekly Setups** → `src/content/setups/`.
Fields match the content schemas exactly; images upload to `public/images/uploads/`
(path prefixed with the `/invest-sema` base via `public_folder`). `assetUrl()` in
`src/lib/config.ts` resolves cover paths whether relative or already base-absolute.

Two ways to use it:

- **Locally (works today, no deploy, no login):** double-click `Invest Sema Admin.command`
  in the project folder → browser opens the panel → click **"Work with Local Repository"**
  → pick the `invest-sema` folder → write → **Save**. Writes straight to the content files
  on disk (needs Chrome/Edge — File System Access API). Then someone runs a deploy to push.
- **Hosted, from anywhere incl. phone (after first deploy):** go to
  `https://lopushokbot.github.io/invest-sema/admin/` → **"Sign In Using Access Token"** →
  paste a GitHub fine-grained PAT (repo `lopushokbot/invest-sema`, Contents: Read+Write) →
  write → **Publish**. That commits to `main`; the deploy Action rebuilds the live site in
  ~1–2 min. No OAuth app / Cloudflare worker required. The token is stored in the browser.

If Sema wants the one-click **"Sign In with GitHub"** button instead of a token, that needs
an OAuth proxy (Cloudflare Worker `sveltia-cms-auth` + a GitHub OAuth App) and
`backend.base_url` set in config.yml — optional, skip unless asked.

---

## Task: Publish a new long read (monthly)

### When to run
Sema sends text (any format — voice note transcript, doc, rough notes) and says publish.

### Steps
1. Create `src/content/longreads/<slug>.md` (or `.mdx` if it needs charts):
   ```
   ---
   title: "Title Here"
   description: "1–2 sentence summary shown on cards and in SEO."
   date: 2026-08-01
   cover: covers/<slug>.svg        # optional
   tags: [Macro, Crypto]           # from: Macro, Crypto, Equities, Strategy (free-form ok)
   ---

   Body in markdown…
   ```
2. **Images**: drop files into `public/images/<slug>/`, reference as
   `![Alt text](/invest-sema/images/<slug>/photo.jpg)` — absolute path incl. base.
   Add `*Caption text*` on the next line for a styled caption.
3. **Charts** (needs `.mdx`): after frontmatter add
   `import Chart from '../../components/Chart.astro';` then
   ```
   <Chart title="…" type="line|area|bar" labels={[…]}
     series={[{ name: '…', values: [-…] }]} prefix="$" suffix="B" note="source note" />
   ```
   Max 4 series. Photo grids: `import Gallery from '../../components/Gallery.astro';`
4. **Cover**: create an elegant abstract SVG in `public/covers/<slug>.svg` (match the
   existing two — soft gradients, thin line-chart motif, no text).
5. Build and eyeball the article page locally (preview server).
6. Commit + push to main — the action deploys automatically.

### Validation
- [ ] Article renders at /longreads/<slug>/, appears on home ("The Long Read") and index
- [ ] Reading time, tags, cover all show; dark mode looks right

---

## Task: Publish a new weekly setup

Same as long read but in `src/content/setups/`, no cover, extra frontmatter field
`type: "Trade idea" | "Watchlist" | "Quick take"`. Keep them short (1–3 min read),
always include a "what proves it wrong" line — that's the house style.

---

## Task: First deploy (pending Sema's OK)

### Prerequisites
Sema has reviewed the local site and said deploy.

### Steps
1. `cd /Users/iibot/Documents/ppppp/workspace/invest-sema`
2. `git init -b main && git add -A && git commit -m "Invest Sema v1"`
3. `gh repo create lopushokbot/invest-sema --public --source . --push`
4. Enable Pages with Actions source:
   `gh api -X POST repos/lopushokbot/invest-sema/pages -f build_type=workflow`
5. `gh workflow run deploy.yml` (or push triggers it) — wait for green:
   `gh run watch`
6. Verify https://lopushokbot.github.io/invest-sema/ (pages, fonts, Telegram feed, OG tags).
7. Update CLAUDE.md here + root CLAUDE.md Known Projects + memory to "deployed".

---

## Task: Change Telegram channel / branding

- Channel: edit `telegram` + `telegramUrl` in `src/lib/config.ts` (one place), rebuild.
- OG image: regenerate via scratchpad `og-card.html` + Playwright screenshot →
  `public/og-default.png` (1200×630).

---

## If something goes wrong
| Symptom | Cause | Fix |
|---------|-------|-----|
| Build error mentioning bare vite path | Ran npx outside project dir | `cd` into project first |
| Telegram sections show subscribe card only | t.me fetch failed/blocked at build time | Rebuild; if persistent, check `curl -A "Mozilla/5.0" https://t.me/s/investsyoma` |
| New piece not appearing | `draft: true` or future quirks in frontmatter | Check frontmatter; date can be future — it still shows (sorted desc) |
| Fonts fallback to serif/system | Base path changed without updating @font-face URLs | Fix `src/styles/global.css` |

---

## Changelog
| Date | Change |
|------|--------|
| 2026-07-23 | **Bloom-style restyle (LOCAL PREVIEW ONLY — uncommitted working-tree changes; live site still on the old blue theme until Sema approves).** Reskinned to the Framer "Bloom" aesthetic using the logo's green (#10d090) + indigo (#5030e0), no pink. Changes in global.css tokens + Base.astro header: soft green→lavender fixed gradient background (--page-bg), floating pill nav + round glass theme toggle, pill badge eyebrows, green tag pills, purple primary / lavender ghost buttons, 26px card radius, deeper indigo ink (#17163a), warm soft shadows. Dark mode = deep indigo-black (#0a0912) with green/purple. Structure/sections all unchanged. OG card regenerated to match. To ship once approved: `git add -A && git commit && git push` (auto-deploys). To discard: `git checkout .`. |
| 2026-07-23 | **DEPLOYED.** Created public repo lopushokbot/invest-sema, pushed, enabled Pages (Actions source), deploy workflow succeeded. Live at https://lopushokbot.github.io/invest-sema/ — all pages/assets/RSS/sitemap/fonts/logo 200, Telegram feed populated at build. Future changes: commit + push to main → auto-deploy. Sema can now post from the live /admin/ via a GitHub PAT ("Sign In Using Access Token"). |
| 2026-07-23 | Setups page now month-grouped (headers + counts), matching Long Reads. About page rewritten with Sema's own copy (title "(Hopefully) Useful thoughts about markets"; typos fixed; "The fine print" kept verbatim). Projects section renamed "My small investment-related projects" and Russian Portfolio Dashboard added (SITE.projects.ruDashboard → lopushokbot.github.io/ru-portfolio-dashboard/). |
| 2026-07-23 | Promoted 3 posts to long reads per Sema (he judges some image-heavy short posts as long reads — his call beats word count). #282 Feb 28 "no fuel" (US/Crypto). #266 Nov 3 crypto watchlist screenshot (BTC/ETH/SOL/HYPE/PUMP/AAVE). #274 Jan 21 Trump/Greenland tariffs screenshot. His "March 1/4" date refs were off — those dates are a crisis-characters meme (#284) + a Dubai joke (#285); matched instead by his descriptions (Trump picture → #274, crypto graph → #266). Confirmed no long reads exist before Oct 2025 (channel start Apr 2022 = short calls + lifestyle only). |
| 2026-07-23 | Display per Sema. Re-tiered 3 too-short "long reads" to setups (#265 53w, #206 26w, #272 31w) so long reads are uniformly substantial (that's why Oct looked overloaded). Long Reads: kept **month grouping** with a **big box per long read** (1/month → full-width, 2 → side by side) and each box shows its EXACT date. Home leads with "THE LONG READ · [month]" big box. Two card styles: big long-read box + compact setup card. |
| 2026-07-23 | Full-channel backfill. Scraped all 80 posts (2022→now). Rule changed: classify by SUBSTANCE (long read = ~150+ words analysis), multiple long reads/month allowed. April now has 2 long reads (#300 US w/ portfolio pic moved up from setups, #301 Russia). Added long reads #258/#260/#262 (Oct DeFi + market-week). Added setups #118/#119/#126 (Dec'24), #128/#184 (Apr'25), #253/#263/#264 (Oct'25), #271/#274 (Jan'26) — all verbatim, photos in public/images/tg/. Skipped lifestyle/travel/business-club/memes. seen.json marked through #310 so the daily agent only takes genuinely new posts. Playbook + CLAUDE.md rule updated. |
| 2026-07-22 | v1 built: Astro site, 5 sections, live TG feed (@investsyoma), chart/gallery components, fonts bundled, SEO+RSS+sitemap, deploy workflow ready. Local only — awaiting Sema's OK to deploy. |
| 2026-07-22 | v2 per Sema: long reads are now his REAL Telegram posts VERBATIM (10 posts, Oct 2025–Apr 2026, Russian, original photos in public/images/tg/, link to original at bottom). NEVER rewrite/translate his posts — he was explicit. Month-first design: index grouped by month, month eyebrows on cards/articles, home features the latest month's posts. Slimmed: nav = Long Reads/Setups/Telegram; About footer-only (Sema will rewrite it); subscribe strip removed. Covers/tag-filter removed from long reads. |
| 2026-07-22 | v3 per Sema: ONE long read per month, chosen by word count (winners: #265 Oct, #206 Nov, #272 Jan, #277 Feb, #301 Apr). All other posts rotated to Weekly Setups with their dates (#266, #278, #279, #282, #300, #306) — Claude's 3 sample setups deleted. About restored to nav (text still placeholder for Sema's rewrite). |
| 2026-07-22 | About page: added "My DeFi projects" cards — DeFi Course, Stablecoin APY Dashboard, DeFi Alpha Chat (t.me/defistable). Links live in SITE.projects (config.ts). |
| 2026-07-22 | v4: added self-serve admin (Sveltia CMS) at public/admin/ — two sections (Long Reads, Weekly Setups). Local mode via `Invest Sema Admin.command` (FS Access, no login); hosted mode via PAT after deploy. Added assetUrl() so CMS-uploaded covers resolve with the base path. No server infra needed. |
| 2026-07-23 | v5: market subsections. New `markets` frontmatter field (array of US / Crypto / Russia) on both collections; filter buttons (All + 3 markets) on Long Reads (hides empty months) and Setups. Added to admin as a multi-select. Tagged all 11 posts. A post can belong to multiple markets. Empty-state text when a market has no posts. |
| 2026-07-23 | v5: brand logo added (Sema's green-arrow/purple-candles mark). Background removed → transparent public/logo.png (+ logo-mark.png, favicon-32.png). Shown in header + footer next to wordmark, as favicon/apple-touch-icon, and in the OG share card. Old favicon.svg removed. Source: ~/Downloads/Telegram Desktop/photo_2026-07-23_15-36-46.jpg. |
| 2026-07-23 | Auto-publish pipeline: `scripts/ingest.mjs` (pull/mark/list) scrapes t.me/s/investsyoma (keys on data-post, ignores album-child ids 311–315, dedups vs footer links + `seen.json`, downloads photos), writes `.cache/pending.json`. `scripts/PUBLISH_PLAYBOOK.md` = the daily agent's procedure (verbatim, one long read/month by word count, skip chatter). Baseline seeded through #310. `npm run ingest` added. Tested live: correctly found the backlog + skipped album media. No bot/token. Activates fully at deploy (daily cloud routine). |
| 2026-07-23 | Added July long read #309 (oil/Iran + US Big Tech rotation, NVIDIA/Meta/SPCX), markets [US]. Its 6-photo album (#310) was lifestyle/nature, NOT investing — Sema said exclude, so photos dropped. Fixed telegram.ts decodeEntities to handle all numeric HTML entities (&#33; etc.) so the live feed shows "!" not "&#33;". Long-read market tags stand as: Oct US, Nov Crypto, Jan US, Feb Crypto, Apr Russia, Jul US (each post is single-topic; multi-tagging ready in schema+admin for future comprehensive reviews). |
