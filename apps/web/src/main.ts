import { createApp } from 'vue';

import App from './App.vue';
import { sessionStoreKey } from './app-context';
import { createVaultLiteAuthClient } from './lib/auth-client';
import { createSessionStore } from './lib/session-store';
import { createTrustedLocalStateStore } from './lib/trusted-local-state';
import { createVaultLiteRouter } from './router';

const sessionStore = createSessionStore({
  authClient: createVaultLiteAuthClient(),
  trustedLocalStateStore: createTrustedLocalStateStore(),
});
const router = createVaultLiteRouter(sessionStore);

const app = createApp(App);
app.provide(sessionStoreKey, sessionStore);
app.use(router);
app.mount('#app');
