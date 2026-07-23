import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://lopushokbot.github.io',
  base: '/invest-sema',
  trailingSlash: 'always',
  integrations: [mdx(), sitemap()],
  build: {
    assets: 'assets',
  },
});
