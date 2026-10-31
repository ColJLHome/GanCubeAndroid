import { defineConfig } from 'vite';
export default defineConfig({
  build: { target: 'es2022' },
  server: { proxy: { '/api': 'http://127.0.0.1:3001' } },
  preview: { proxy: { '/api': 'http://127.0.0.1:3001' } },
});
