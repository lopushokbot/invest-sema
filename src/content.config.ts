import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const longreads = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/longreads' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    cover: z.string().optional(),
    tags: z.array(z.string()).default([]),
    markets: z.array(z.enum(['US', 'Crypto', 'Russia'])).default([]),
    draft: z.boolean().default(false),
  }),
});

const setups = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/setups' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    type: z.enum(['Trade idea', 'Watchlist', 'Quick take']).default('Quick take'),
    tags: z.array(z.string()).default([]),
    markets: z.array(z.enum(['US', 'Crypto', 'Russia'])).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { longreads, setups };
