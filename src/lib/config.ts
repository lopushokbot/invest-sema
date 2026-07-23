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
    defiAlphaChat: 'https://t.me/defistable',
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
