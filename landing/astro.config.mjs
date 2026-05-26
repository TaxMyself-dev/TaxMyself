// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://keepintax.co.il', // update when production domain is confirmed
  integrations: [sitemap()],
});
