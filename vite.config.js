import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Pages: the landing page, the inner pages (FAQ, Delivery, About us, Contact)
// and the standalone 3D model test page. Inner pages live in folders
// (about/index.html …), so their addresses have no .html: /about/, /faq/ …
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        modelTest: resolve(import.meta.dirname, 'model-test.html'),
        faq: resolve(import.meta.dirname, 'faq/index.html'),
        delivery: resolve(import.meta.dirname, 'delivery/index.html'),
        about: resolve(import.meta.dirname, 'about/index.html'),
        contact: resolve(import.meta.dirname, 'contact/index.html'),
      },
    },
  },
});
