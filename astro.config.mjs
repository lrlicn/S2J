import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import adminApi from './plugins/admin-api.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://s2j.dev',
  integrations: [
    tailwind({
      applyBaseStyles: false,
    }),
    mdx(),
    sitemap(),
  ],
  markdown: {
    shikiConfig: {
      theme: 'github-dark-dimmed',
      wrap: true,
    },
  },
  vite: {
    plugins: [adminApi()],
    ssr: {
      noExternal: [],
    },
  },
});
