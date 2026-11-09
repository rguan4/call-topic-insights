try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch { /* no backend/.env */ }
import { createApp } from './app';

const port = Number(process.env.PORT ?? 4000);
createApp().listen(port, () => {
  console.log(`Call Topic Insights API on http://localhost:${port}`);
});
