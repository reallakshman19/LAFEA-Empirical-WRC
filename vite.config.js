import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const buildTime = new Date().toISOString();

/**
 * LAFEA + Empirical/WRC app build.
 *  - index.html : two-view app (LAFEA + Empirical/WRC)
 *  - lafea.html : original single-view standalone LAFEA entry (kept for the
 *                 inherited boundary checks and e2e specs)
 */
export default defineConfig({
  base: './',
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: false,
    manifest: true,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        lafea: fileURLToPath(new URL('./lafea.html', import.meta.url)),
      },
    },
  },
});
