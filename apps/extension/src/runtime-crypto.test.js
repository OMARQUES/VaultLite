import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, test } from 'vitest';
import { argon2idAsync } from '../vendor/noble-hashes/argon2.js';
import { decryptLocalUnlockEnvelope } from '../runtime-crypto.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const runtimeCryptoPath = resolve(currentDir, '../runtime-crypto.js');

describe('runtime-crypto module loading strategy', () => {
  test('avoids dynamic import() in extension service worker crypto path', () => {
    const source = readFileSync(runtimeCryptoPath, 'utf8');
    expect(source.includes('import(')).toBe(false);
  });

  test('does not depend on extension node_modules at runtime', () => {
    const source = readFileSync(runtimeCryptoPath, 'utf8');
    expect(source.includes('./node_modules/')).toBe(false);
    expect(source.includes('./vendor/noble-hashes/argon2.js')).toBe(true);
  });

  test(
    'decrypts local unlock envelope with vendored argon2 runtime',
    async () => {
    const textEncoder = new TextEncoder();
    const authSalt = 'AAAAAAAAAAAAAAAAAAAAAA';
    const password = 'M*X5SmR5';
    const payload = {
      accountKey: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE',
      marker: 'ok',
    };
    const saltBytes = base64UrlToBytes(authSalt);
    const keyMaterial = await argon2idAsync(password, saltBytes, {
      m: 65536,
      t: 3,
      p: 4,
      dkLen: 32,
    });
    const key = await crypto.subtle.importKey('raw', toArrayBuffer(keyMaterial), { name: 'AES-GCM' }, false, [
      'encrypt',
    ]);
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(nonce),
      },
      key,
      textEncoder.encode(JSON.stringify(payload)),
    );
    const envelope = {
      version: 'local-unlock.v1',
      nonce: bytesToBase64Url(nonce),
      ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    };

    const decrypted = await decryptLocalUnlockEnvelope({
      password,
      authSalt,
      envelope,
    });

    expect(decrypted).toEqual(payload);
    },
    30000,
  );
});

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
