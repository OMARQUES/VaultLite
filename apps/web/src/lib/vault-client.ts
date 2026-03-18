import type {
  AttachmentUploadContentInput,
  AttachmentUploadInitInput,
  AttachmentUploadInitOutput,
  AttachmentUploadListOutput,
  AttachmentUploadRecord,
  VaultItemCreateInput,
  VaultItemListOutput,
  VaultItemRecord,
  VaultItemUpdateInput,
} from '@vaultlite/contracts';

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  const target = document.cookie
    .split(';')
    .map((segment) => segment.trim())
    .find((segment) => segment.startsWith(prefix));

  return target ? decodeURIComponent(target.slice(prefix.length)) : null;
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: 'include',
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.method && !['GET', 'HEAD'].includes(init.method)
        ? { 'x-csrf-token': readCookie('vl_csrf') ?? '' }
        : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let responseCode = '';
    let responseMessage = '';
    let responseReasonCode = '';
    let responseResult = '';

    try {
      const errorBody = (await response.clone().json()) as {
        code?: string;
        message?: string;
        reasonCode?: string;
        result?: string;
      };
      responseCode = typeof errorBody.code === 'string' ? errorBody.code : '';
      responseMessage = typeof errorBody.message === 'string' ? errorBody.message : '';
      responseReasonCode = typeof errorBody.reasonCode === 'string' ? errorBody.reasonCode : '';
      responseResult = typeof errorBody.result === 'string' ? errorBody.result : '';
    } catch {
      // Preserve status-only error below.
    }

    const details = responseMessage || responseCode || responseReasonCode || responseResult;
    throw new Error(
      details
        ? `Request failed with status ${response.status} (${details})`
        : `Request failed with status ${response.status}`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export interface VaultLiteVaultClient {
  listItems(): Promise<VaultItemListOutput>;
  getItem(itemId: string): Promise<VaultItemRecord>;
  createItem(input: VaultItemCreateInput): Promise<VaultItemRecord>;
  updateItem(input: VaultItemUpdateInput & { itemId: string }): Promise<VaultItemRecord>;
  deleteItem(itemId: string): Promise<void>;
  initAttachmentUpload(input: AttachmentUploadInitInput): Promise<AttachmentUploadInitOutput>;
  uploadAttachmentContent(
    uploadId: string,
    input: AttachmentUploadContentInput,
  ): Promise<AttachmentUploadRecord>;
  listAttachmentUploads(itemId: string): Promise<AttachmentUploadListOutput>;
}

export function createVaultLiteVaultClient(baseUrl = ''): VaultLiteVaultClient {
  return {
    listItems() {
      return requestJson<VaultItemListOutput>(`${baseUrl}/api/vault/items`);
    },
    getItem(itemId) {
      return requestJson<VaultItemRecord>(`${baseUrl}/api/vault/items/${itemId}`);
    },
    createItem(input) {
      return requestJson<VaultItemRecord>(`${baseUrl}/api/vault/items`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    updateItem(input) {
      return requestJson<VaultItemRecord>(`${baseUrl}/api/vault/items/${input.itemId}`, {
        method: 'PUT',
        body: JSON.stringify({
          itemType: input.itemType,
          encryptedPayload: input.encryptedPayload,
          expectedRevision: input.expectedRevision,
        }),
      });
    },
    deleteItem(itemId) {
      return requestJson<void>(`${baseUrl}/api/vault/items/${itemId}`, {
        method: 'DELETE',
      });
    },
    initAttachmentUpload(input) {
      return requestJson<AttachmentUploadInitOutput>(`${baseUrl}/api/attachments/uploads/init`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    uploadAttachmentContent(uploadId, input) {
      return requestJson<AttachmentUploadRecord>(`${baseUrl}/api/attachments/uploads/${uploadId}/content`, {
        method: 'PUT',
        body: JSON.stringify(input),
      });
    },
    listAttachmentUploads(itemId) {
      return requestJson<AttachmentUploadListOutput>(
        `${baseUrl}/api/attachments?itemId=${encodeURIComponent(itemId)}`,
      );
    },
  };
}
