import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { defineConfig } from 'vite';

// iwsdk.config.json is the project authority (scene, assets, XR features);
// this file only wires the IWSDK dev plugin. Port 8082, so it can run next to
// the test app (8081).
export default defineConfig({
  plugins: [iwsdkDev()],
  server: { host: '0.0.0.0', port: 8082, open: false },
  build: { outDir: 'dist', target: 'esnext', rollupOptions: { input: './index.html' } },
  esbuild: { target: 'esnext' },
  resolve: { dedupe: ['three'] },
  optimizeDeps: { exclude: ['@babylonjs/havok'], include: ['three'], esbuildOptions: { target: 'esnext' } },
  publicDir: 'public',
  base: './',
});
