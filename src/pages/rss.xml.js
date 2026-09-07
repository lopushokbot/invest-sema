import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { SITE } from '../lib/config';

export async function GET(context) {
  const longreads = await getCollection('longreads', ({ data }) => !data.draft);
  const setups = await getCollection('setups', ({ data }) => !data.draft);
  const memos = await getCollection('memos', ({ data }) => !data.draft);

  const items = [
    ...longreads.map((p) => ({
      title: p.data.title,
      description: p.data.description,
      pubDate: p.data.date,
      link: `/invest-sema/longreads/${p.id}/`,
      categories: ['Long Read', ...p.data.tags],
    })),
    ...setups.map((p) => ({
      title: p.data.title,
      description: p.data.description,
      pubDate: p.data.date,
      link: `/invest-sema/setups/${p.id}/`,
      categories: [p.data.type, ...p.data.tags],
    })),
    ...memos.map((p) => ({
      title: `${p.data.title} memo`,
      description: p.data.description,
      pubDate: p.data.date,
      link: `/invest-sema/memos/${p.id}/`,
      categories: ['Position Memo', p.data.market, ...p.data.tags],
    })),
  ].sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  return rss({
    title: SITE.name,
    description: SITE.description,
    site: context.site,
    items,
  });
}
