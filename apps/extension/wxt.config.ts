import { defineConfig } from 'wxt';
import { readFileSync } from 'node:fs';

const brand = JSON.parse(readFileSync(new URL('../../brand.config.json', import.meta.url), 'utf8'));

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: brand.productName,
    description: brand.tagline,
    version: '0.0.1',
    minimum_chrome_version: '116',
    // Minimal on purpose. Optional power permission is requested at runtime only.
    permissions: ['storage', 'sidePanel', 'alarms', 'downloads', 'offscreen', 'unlimitedStorage'],
    optional_permissions: ['power'],
    host_permissions: [],
    optional_host_permissions: ['https://*/*'],
    action: { default_title: brand.productName },
    side_panel: { default_path: 'sidepanel.html' },
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
  },
});
