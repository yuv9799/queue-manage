import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/queue-manage/' : '/',
  plugins: [react()],
  server: {
    port: 5173,
  },
}));
