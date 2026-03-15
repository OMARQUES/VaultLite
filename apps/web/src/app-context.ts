import type { InjectionKey } from 'vue';

import type { SessionStore } from './lib/session-store';

export const sessionStoreKey: InjectionKey<SessionStore> = Symbol('vaultlite-session-store');
