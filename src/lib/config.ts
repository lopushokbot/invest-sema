export const SITE = {
  name: 'Invest Sema',
  tagline: 'Notes on markets, investing & the life around it',
  description:
    'Monthly long reads and weekly trade setups from Sema — an investor writing about macro, crypto, equities and the life around markets.',
  author: 'Sema',
  telegram: 'investsyoma',
  telegramUrl: 'https://t.me/investsyoma',
  url: 'https://lopushokbot.github.io/invest-sema/',
  projects: {
    defiCourse: 'https://lopushokbot.github.io/defi-course/',
    apyDashboard: 'https://lopushokbot.github.io/portfolio-dashboard/apy_dashboard.html',
    ruDashboard: 'https://lopushokbot.github.io/ru-portfolio-dashboard/',
    usDashboard: 'https://lopushokbot.github.io/us-portfolio-dashboard/',
  },
};

/** Join a site-internal path with the deploy base (/invest-sema/). */
export function url(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  if (path === '' || path === '/') return base + '/';
  return base + '/' + path.replace(/^\//, '');
}

/** The three markets Sema writes about. `id` is stored in frontmatter. */
export const MARKETS = [
  { id: 'US', label: 'US market' },
  { id: 'Crypto', label: 'Crypto market' },
  { id: 'Russia', label: 'Russian market' },
] as const;

export type MarketId = (typeof MARKETS)[number]['id'];

/** The five markets the Position Memos page is divided into (order = page order). */
export const MEMO_MARKETS = [
  { id: 'US', label: 'US market', blurb: 'US equities, indices and the companies behind them.' },
  { id: 'UAE', label: 'UAE market', blurb: 'Dubai and Abu Dhabi listings, real estate and local ventures.' },
  { id: 'Russia', label: 'Russian market', blurb: 'Russian equities, bonds and rouble positions.' },
  { id: 'Crypto', label: 'Crypto market', blurb: 'Coins, tokens and on-chain yield.' },
  { id: 'Commodities', label: 'Commodities market', blurb: 'Gold, energy and other real assets.' },
] as const;

export type MemoMarketId = (typeof MEMO_MARKETS)[number]['id'];
export const MEMO_STATUSES = ['Holding', 'Watching', 'Closed'] as const;

/** Resolve a content-provided asset path: absolute/URL as-is, else add the base. */
export function assetUrl(path: string): string {
  if (!path) return path;
  if (/^https?:\/\//.test(path) || path.startsWith('/')) return path;
  return url(path);
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatMonth(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** ~220 wpm reading time from raw markdown body. */
export function readingTime(body: string | undefined): number {
  if (!body) return 1;
  const words = body.replace(/[#*_>`\[\]()!-]/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}
