// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // Wild Tracks was renamed Find My Shark; keep old links working
  redirects: {
    '/wild-tracks': '/find-my-shark/',
  },
});
