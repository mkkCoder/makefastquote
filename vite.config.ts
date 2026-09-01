// vitest's defineConfig is a superset of vite's and is what makes the
// `test` block below type-check. Importing from 'vite' instead is a
// compile error that only shows up in `tsc -b`, not in `vite build`.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

// Base path is a single variable so moving between an apex domain and a
// project subpath (username.github.io/makefastquote/) is a one-line change.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // TRAP: jsPDF statically pulls in html2canvas and dompurify (~58 kB
      // gzipped) purely for its .html() path. We draw the PDF vectorially and
      // never call .html(), so both are aliased to a stub that throws if
      // anything ever reaches for them. Removing these aliases silently adds
      // ~58 kB to every visitor's download.
      html2canvas: resolve(root, 'src/pdf/unused-stub.ts'),
      dompurify: resolve(root, 'src/pdf/unused-stub.ts'),
      canvg: resolve(root, 'src/pdf/unused-stub.ts'),
    },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        app: resolve(root, 'app/index.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: true,
  },
});
