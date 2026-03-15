import { argon2Sync } from 'node:crypto';

export const ACCOUNT_KDF_PROFILE = {
  algorithm: 'argon2id',
  memory: 65536,
  passes: 3,
  parallelism: 4,
  tagLength: 32,
} as const;

export interface DeriveMasterKeyInput {
  password: string;
  salt: Buffer;
}

export function deriveMasterKey({ password, salt }: DeriveMasterKeyInput): Buffer {
  return argon2Sync('argon2id', {
    message: password,
    nonce: salt,
    parallelism: ACCOUNT_KDF_PROFILE.parallelism,
    tagLength: ACCOUNT_KDF_PROFILE.tagLength,
    memory: ACCOUNT_KDF_PROFILE.memory,
    passes: ACCOUNT_KDF_PROFILE.passes,
  });
}
