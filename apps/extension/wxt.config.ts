import { defineConfig } from 'wxt';
import { readFileSync } from 'node:fs';

const brand = JSON.parse(readFileSync(new URL('../../brand.config.json', import.meta.url), 'utf8'));

export default defineConfig({
  hooks: {
    // The ffmpeg core must ship inside the extension: MV3 forbids loading code from a remote host.
    'build:publicAssets': (_wxt, files) => {
      const dir = new URL('./node_modules/@ffmpeg/core/dist/esm/', import.meta.url).pathname;
      const lib = new URL('./node_modules/@ffmpeg/ffmpeg/dist/esm/', import.meta.url).pathname;
      files.push(
        { absoluteSrc: `${dir}ffmpeg-core.js`, relativeDest: 'ffmpeg/ffmpeg-core.js' }, { absoluteSrc: `${dir}ffmpeg-core.wasm`, relativeDest: 'ffmpeg/ffmpeg-core.wasm' },
        // The wrapper's worker and its two imports, shipped as-is so no bundler rewrites the worker URL.
        ...['worker.js', 'const.js', 'errors.js'].map((f) => ({ absoluteSrc: `${lib}${f}`, relativeDest: `ffmpeg/${f}` })),
      );
    },
  },
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: brand.productName,
    description: brand.tagline,
    version: '0.0.1',
    minimum_chrome_version: '116',
    // Minimal on purpose. Optional power permission is requested at runtime only.
    permissions: ['storage', 'sidePanel', 'alarms', 'downloads', 'offscreen', 'unlimitedStorage'],
    optional_permissions: ['power'],
    // Fixed provider API hosts only; custom endpoints use the optional permission prompt.
    host_permissions: [
      'https://api.anthropic.com/*', 'https://api.openai.com/*', 'https://queue.fal.run/*', 'https://api.elevenlabs.io/*',
      ...(process.env.WXT_E2E ? ['http://127.0.0.1/*'] : []),
    ],
    optional_host_permissions: ['https://*/*'],
    action: { default_title: brand.productName },
    side_panel: { default_path: 'sidepanel.html' },
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
  },
});
