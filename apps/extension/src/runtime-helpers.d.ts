declare module '../popup-behavior.js' {
  export function shouldDisableControlWhileBusy(controlId: string, isBusy: boolean): boolean;
}

declare module '../credential-cache-diagnostics.js' {
  export function diagnoseCredentialCache(input: {
    loginEntriesSeen: number;
    decryptedEntries: number;
    decryptFailures: number;
  }): { code: 'credential_decrypt_failed'; message: string } | null;
}

