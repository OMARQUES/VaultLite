import type { AttachmentLifecycleState, UserLifecycleState } from './lifecycle';

export const VAULT_ITEM_TYPES = ['login', 'document'] as const;
export type VaultItemType = (typeof VAULT_ITEM_TYPES)[number];

export interface VaultUser {
  userId: string;
  username: string;
  lifecycleState: UserLifecycleState;
}

export interface TrustedDevice {
  deviceId: string;
  deviceName: string;
  platform: 'web' | 'extension';
  createdAt: string;
}

export interface LoginItemPayload {
  title: string;
  username: string;
  password: string;
  urls: string[];
  notes: string;
}

export interface DocumentItemPayload {
  title: string;
  content: string;
}

export type VaultItemPayloadByType = {
  login: LoginItemPayload;
  document: DocumentItemPayload;
};

export interface VaultItemRecord {
  itemId: string;
  ownerUserId: string;
  itemType: VaultItemType;
  revision: number;
  encryptedPayload: string;
  createdAt: string;
  updatedAt: string;
}

export interface VaultItemTombstoneRecord {
  itemId: string;
  ownerUserId: string;
  itemType: VaultItemType;
  revision: number;
  deletedAt: string;
}

export interface AttachmentRecord {
  attachmentId: string;
  ownerUserId: string;
  itemId: string | null;
  lifecycleState: AttachmentLifecycleState;
}
