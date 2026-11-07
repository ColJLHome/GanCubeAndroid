import { defineConfig } from 'vite';
import { attachApi } from './server/vite-api.mjs';
export default defineConfig({
  build: { target: 'es2022' },
  plugins: [{ name: 'local-cube-api', configureServer: attachApi, configurePreviewServer: attachApi }],
});
