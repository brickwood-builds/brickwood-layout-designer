/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Writes sw.js listing every built file, so the app opens and works offline once it
 * has been loaded on a device (e.g. the iPad at a show with no wifi).
 */
function offlineServiceWorker(): Plugin {
  return {
    name: 'brickwood-offline-sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const version = createHash('sha256').update(files.sort().join('|')).digest('hex').slice(0, 12);
      // The pages themselves (the app and the classic version) are added by name: Vite writes
      // the HTML files after this list is made.
      const assets = JSON.stringify(['./', './classic.html', ...files.filter((f) => !f.endsWith('.html')).map((f) => `./${f}`)]);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `// Generated at build time. Cache-first for built files, network-first for the page.
const CACHE = 'brickwood-${version}';
const ASSETS = ${assets};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('brickwood-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Each page under its own address (the app, and the trial interface at next.html).
    // The app (./) and the classic interface (classic.html), each kept under its own address.
    const page = new URL(req.url).pathname.split('/').pop() ?? '';
    const key = page === 'classic.html' || page === 'next.html' ? './' + page : './';
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(key, copy));
          return res;
        })
        .catch(() => caches.match(key, { ignoreVary: true })),
    );
    return;
  }
  // Built files are static; ignore Vary so module-script (CORS-mode) requests still match.
  e.respondWith(caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req)));
});
`,
      });
    },
  };
}

// Relative base so the static build works from GitHub Pages or any sub-folder.
export default defineConfig({
  base: './',
  plugins: [react(), offlineServiceWorker()],
  // Pages: the app (index.html, the new interface), the classic interface (classic.html), and
  // next.html, which now just leads to the app (it was the trial's address).
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        classic: fileURLToPath(new URL('./classic.html', import.meta.url)),
        next: fileURLToPath(new URL('./next.html', import.meta.url)),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
  },
});
