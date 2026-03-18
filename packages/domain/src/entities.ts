import type { AttachmentLifecycleState, DeviceState, UserLifecycleState, UserRole } from './lifecycle';

export const VAULT_ITEM_TYPES = ['login', 'document', 'card', 'secure_note'] as const;
export type VaultItemType = (typeof VAULT_ITEM_TYPES)[number];

export interface VaultUser {
  userId: string;
  username: string;
  role: UserRole;
  lifecycleState: UserLifecycleState;
}

export interface TrustedDevice {
  deviceId: string;
  deviceName: string;
  platform: 'web' | 'extension';
  deviceState: DeviceState;
  createdAt: string;
}

export interface VaultCustomField {
  label: string;
  value: string;
}

export interface LoginItemPayload {
  title: string;
  username: string;
  password: string;
  urls: string[];
  notes: string;
  customFields: VaultCustomField[];
}

export interface DocumentItemPayload {
  title: string;
  content: string;
  customFields: VaultCustomField[];
}

export interface CardItemPayload {
  title: string;
  cardholderName: string;
  brand: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  securityCode: string;
  notes: string;
  customFields: VaultCustomField[];
}

export interface SecureNoteItemPayload {
  title: string;
  content: string;
  customFields: VaultCustomField[];
}

export type VaultItemPayloadByType = {
  login: LoginItemPayload;
  document: DocumentItemPayload;
  card: CardItemPayload;
  secure_note: SecureNoteItemPayload;
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
  encryptedPayload: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string;
}

export interface AttachmentRecord {
  attachmentId: string;
  ownerUserId: string;
  itemId: string | null;
  lifecycleState: AttachmentLifecycleState;
}
