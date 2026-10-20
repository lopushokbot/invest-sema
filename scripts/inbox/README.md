Rich Telegram posts captured by `scripts/tg-inbox.mjs` (the channel bot). One `<post id>.json`
per post: verbatim markdown (photos/videos placed inline) + plain text. `ingest.mjs` prefers
these over the unreadable web preview. Safe to keep — published ids are deduped.
