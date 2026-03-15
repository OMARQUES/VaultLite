import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

import { createLocalApiProxyConfig } from './vite.proxy';

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: createLocalApiProxyConfig(process.env),
  },
});
