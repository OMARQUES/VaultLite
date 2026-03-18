export const VAULT_UNAUTHORIZED_EVENT = 'vaultlite:unauthorized';

export interface VaultUnauthorizedEventDetail {
  source: 'auth' | 'vault';
  status: number;
  code: string | null;
  message: string | null;
  url: string;
}

export function dispatchVaultUnauthorizedEvent(detail: VaultUnauthorizedEventDetail) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<VaultUnauthorizedEventDetail>(VAULT_UNAUTHORIZED_EVENT, {
      detail,
    }),
  );
}
