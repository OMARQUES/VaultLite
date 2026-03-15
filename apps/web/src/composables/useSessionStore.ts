import { inject } from 'vue';

import { sessionStoreKey } from '../app-context';

export function useSessionStore() {
  const sessionStore = inject(sessionStoreKey);
  if (!sessionStore) {
    throw new Error('Session store not provided');
  }

  return sessionStore;
}
