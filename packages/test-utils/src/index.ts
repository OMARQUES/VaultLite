import type { Clock, IdGenerator } from '@vaultlite/runtime-abstractions';
import {
  createInMemoryVaultLiteStorage,
  type VaultLiteStorage,
} from '@vaultlite/storage-abstractions';

export class FixedClock implements Clock {
  constructor(private readonly value: Date) {}

  now(): Date {
    return new Date(this.value);
  }
}

export class QueueIdGenerator implements IdGenerator {
  constructor(private readonly values: string[]) {}

  nextId(prefix: string): string {
    const next = this.values.shift();
    if (!next) {
      throw new Error(`No queued id available for prefix ${prefix}`);
    }

    return `${prefix}_${next}`;
  }
}

export function createTestStorage(input: {
  failOnCompleteOnboardingAtomicStep?: 'user' | 'invite' | 'device' | 'session';
} = {}): VaultLiteStorage {
  return createInMemoryVaultLiteStorage(input);
}
