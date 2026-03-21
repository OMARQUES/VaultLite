export function diagnoseCredentialCache(stats) {
  if (stats.loginEntriesSeen > 0 && stats.decryptedEntries === 0 && stats.decryptFailures > 0) {
    return {
      code: 'credential_decrypt_failed',
      message:
        'Could not decrypt login items with this trusted state. Lock and unlock again. If it persists, reconnect this extension.',
    };
  }

  return null;
}

