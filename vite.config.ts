import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Base path for GitHub Pages: served at /<repo-name>/
export default defineConfig({
  plugins: [react()],
  base: '/shape-helper-for-the-artisan-of-glimmith/',
});
