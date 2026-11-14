import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development PORT is the port people open (Vite), and Hono runs on SERVER_PORT.
const serverUrl = `http://localhost:${process.env.SERVER_PORT ?? '3000'}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT ?? '5173'),
    strictPort: true,
    proxy: {
      '/healthz': serverUrl,
      '/api': serverUrl,
    },
  },
});
