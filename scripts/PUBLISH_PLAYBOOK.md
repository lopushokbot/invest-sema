# Auto-publish playbook — Telegram → Invest Sema

> **IMPLEMENTED as code:** `scripts/autopublish.mjs` (run by GitHub Actions daily, 23:00
> Dubai) encodes the rules below deterministically — no human/LLM in the loop. This doc is
> the spec for that script and the guide for anyone publishing/tuning by hand. Sema's rules
> below are absolute; posts are always **verbatim** (only frontmatter is authored).

## Non-negotiable rules
1. **VERBATIM.** Never rewrite, translate, summarize, or "improve" Sema's text. Copy it
   exactly (Russian, emoji, typos and all). You only *choose the category* and *write
   frontmatter* (title, description, tags, markets, type) around his untouched words.
2. **Only investing content gets published.** The channel also has personal chatter,
   weather gripes, pinned/service lines ("… pinned …"), photo-only posts, course promos,
   and lifestyle albums. **Skip all of it** — mark those ids handled, publish nothing.
3. **Classify by SUBSTANCE (not a fixed monthly count).** A **Long Read** is a
   substantial analysis / deep-dive / how-to (roughly **150+ words**). A **Setup** is a
   shorter take, call, review, or news note. A month may have **several long reads or
   none** — do not force one-per-month, and do not move existing files around to keep a
   count.
4. When unsure whether something is investing analysis vs. chatter, **skip it** (mark
   handled). Publishing his own text unchanged is low-risk; publishing off-topic noise is
   the thing to avoid.

## Steps (run daily)

### 1. Pull new posts
```
cd /Users/iibot/Documents/ppppp/workspace/invest-sema
node scripts/ingest.mjs pull
```
Reads `scripts/.cache/pending.json` — an array of new posts, each:
`{ id, date (YYYY-MM-DD), link, words, hasVideo, photos:[/invest-sema/…], text }`.
If empty → nothing to do, stop.

### 2. Triage each pending post
For each entry, decide **PUBLISH** or **SKIP**.

**SKIP** (mark handled, no file) when the post is:
- photo/video-only or near-empty text (`words` ≈ 0), a service/`pinned` line, a weather or
  personal aside, a pure course/channel promo, or otherwise not market/investing analysis.

**PUBLISH** when it's genuine investing content: market views, trade ideas, macro takes,
portfolio updates, crypto/equity/Russia analysis, earnings reviews, watchlists.

### 3. For each PUBLISH post — pick the category
- Group the post by its **calendar month** (`date`).
- Look at what's already published that month in `src/content/longreads/` and
  `src/content/setups/` **plus** the other pending PUBLISH posts of that month.
- If the post is a **substantial analysis / deep-dive / how-to (~150+ words)** → **Long
  Read**. Otherwise (a shorter take, call, review, news note) → **Setup**. Multiple long
  reads per month are fine; never relocate existing files just to hit a count.

### 4. Write the content file
Path: `src/content/<longreads|setups>/<YYYY-MM-slug>.md`
(slug = short kebab-case from the topic, e.g. `2026-08-oil-rotation`).

Long Read frontmatter:
```
---
title: "<a faithful headline drawn from his opening line — Russian, no spin>"
description: "<1–2 sentence factual summary for cards & SEO — Russian>"
date: <YYYY-MM-DD from manifest>
tags: [<from: Macro, Crypto, Equities, Strategy — free-form ok>]
markets: [<any of: US, Crypto, Russia>]
---
```
Setup frontmatter — same, **minus nothing**, **plus** `type:` (one of
`"Trade idea" | "Watchlist" | "Quick take"`), and keep setups short. House style: if he
states a thesis, keep his "what proves it wrong" line if present.

**Body** = his `text` **verbatim**. Preserve paragraph breaks. Then, for each photo in
`photos`, insert on its own line where it makes sense (usually after the relevant
paragraph or at the end):
```
![<short Russian alt from context>](/invest-sema/images/tg/<id>.jpg)
```
End every file with the original-post link:
```

---

*[Оригинал поста в Telegram →](<link from manifest>)*
```

### 5. Mark handled + deploy
```
node scripts/ingest.mjs mark <all ids you just processed — published AND skipped>
npx astro build           # sanity check it compiles
git add -A && git commit -m "Publish TG posts: #<ids>"
git push                  # GitHub Action rebuilds & deploys (once the repo exists)
```

### Validation checklist
- [ ] Published files render at `/longreads/<slug>/` or `/setups/<slug>/`
- [ ] Each post is categorized by substance (long read = ~150+ words of analysis)
- [ ] Text is byte-for-byte his; only frontmatter is authored
- [ ] Photos resolve; footer link points to the right post id
- [ ] Every pending id is now in `scripts/seen.json` (via `mark`)

## Notes
- Dedup is automatic: `pull` ignores anything already in a content file's footer link or in
  `seen.json`, and ignores album-child media ids (keys on `data-post`).
- `scripts/seen.json` is committed (shared state). `scripts/.cache/` is transient (gitignored).
- If `pull` shows a post you're unsure about, it's fine to leave it unmarked and let Sema
  decide next time — it will simply resurface on the next run.
