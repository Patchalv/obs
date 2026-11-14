import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const serverPort = process.env.PORT ?? '3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT ?? '5173'),
    strictPort: true,
    proxy: {
      '/healthz': `http://localhost:${serverPort}`,
      '/api': `http://localhost:${serverPort}`,
    },
  },
});
