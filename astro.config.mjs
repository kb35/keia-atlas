// Astro builds the console as static pages from the YAML in data/.
// https://docs.astro.build/en/reference/configuration-reference/
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://kb35.github.io',
  base: '/keia-atlas',
  trailingSlash: 'always',
  build: { format: 'directory' },
  // The Astro dev toolbar is a developer tool; nobody using or demoing Keia Atlas should see it.
  devToolbar: { enabled: false },
  // Old addresses (room types, Plan, Schedule) are small pages in src/pages that send the
  // browser on: Astro's redirects drop the base path from their targets (see Moved.astro).
});
