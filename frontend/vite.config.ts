import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// API_PORT lets several dev servers run side by side (defaults to 4000).
const apiPort = process.env.API_PORT ?? '4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    proxy: { '/api': `http://localhost:${apiPort}` }
  }
});
