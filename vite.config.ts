import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: './index.html',
        converter: './converter.html',
        battleSim: './battle-sim.html'
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
});
