import { generateKeyPairSync, sign, verify, type KeyLike } from 'node:crypto';

import { AccountKitPayloadSchema, type AccountKitPayload } from '@vaultlite/contracts';

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
        return accumulator;
      }, {});
  }

  return value;
}

export function canonicalizeAccountKitPayload(payload: AccountKitPayload): string {
  const validatedPayload = AccountKitPayloadSchema.parse(payload);
  return JSON.stringify(sortKeysDeep(validatedPayload));
}

export function generateAccountKitKeyPair() {
  return generateKeyPairSync('ed25519');
}

export function signAccountKitPayload({ payload, privateKey }: { payload: AccountKitPayload; privateKey: KeyLike }): string {
  const serialized = canonicalizeAccountKitPayload(payload);
  return sign(null, Buffer.from(serialized, 'utf8'), privateKey).toString('base64url');
}

export function verifyAccountKitSignature({
  payload,
  signature,
  publicKey,
}: {
  payload: AccountKitPayload;
  signature: string;
  publicKey: KeyLike;
}): boolean {
  const serialized = canonicalizeAccountKitPayload(payload);
  return verify(null, Buffer.from(serialized, 'utf8'), publicKey, Buffer.from(signature, 'base64url'));
}
