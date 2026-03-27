import type {
  AttachmentStateOutput,
  AttachmentUploadContentInput,
  AttachmentUploadEnvelopeOutput,
  AttachmentUploadFinalizeOutput,
  AttachmentUploadInitInput,
  AttachmentUploadInitOutput,
  AttachmentUploadListOutput,
  AttachmentUploadRecord,
  SyncSnapshotOutput,
  VaultItemCreateInput,
  VaultItemListOutput,
  VaultItemRecord,
  VaultItemRestoreOutput,
  VaultItemUpdateInput,
} from '@vaultlite/contracts';
import { dispatchVaultUnauthorizedEvent } from './http-events';

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  const target = document.cookie
    .split(';')
    .map((segment) => segment.trim())
    .find((segment) => segment.startsWith(prefix));

  return target ? decodeURIComponent(target.slice(prefix.length)) : null;
}

async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: {
    emitUnauthorizedEvent?: boolean;
  },
): Promise<T> {
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
    if (response.status === 401 && options?.emitUnauthorizedEvent) {
      dispatchVaultUnauthorizedEvent({
        source: 'vault',
        status: 401,
        code: responseCode || null,
        message: responseMessage || null,
        url: typeof input === 'string' ? input : input.toString(),
      });
    }
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
  pullSyncSnapshot(input?: {
    snapshotToken?: string;
    cursor?: string;
    pageSize?: number;
    etag?: string;
    signal?: AbortSignal;
  }): Promise<
    | {
        status: 'ok';
        etag: string | null;
        payload: SyncSnapshotOutput;
      }
    | {
        status: 'not_modified';
        etag: string | null;
      }
  >;
  getItem(itemId: string): Promise<VaultItemRecord>;
  createItem(input: VaultItemCreateInput): Promise<VaultItemRecord>;
  updateItem(input: VaultItemUpdateInput & { itemId: string }): Promise<VaultItemRecord>;
  deleteItem(itemId: string): Promise<void>;
  restoreItem(itemId: string): Promise<VaultItemRestoreOutput>;
  initAttachmentUpload(input: AttachmentUploadInitInput): Promise<AttachmentUploadInitOutput>;
  uploadAttachmentContent(
    uploadId: string,
    input: AttachmentUploadContentInput,
  ): Promise<AttachmentUploadRecord>;
  finalizeAttachmentUpload(uploadId: string, itemId: string): Promise<AttachmentUploadFinalizeOutput>;
  getAttachmentEnvelope(uploadId: string): Promise<AttachmentUploadEnvelopeOutput>;
  listAttachmentUploads(itemId: string): Promise<AttachmentUploadListOutput>;
  listAttachmentState(input?: { cursor?: string; pageSize?: number }): Promise<AttachmentStateOutput>;
}

export function createVaultLiteVaultClient(baseUrl = ''): VaultLiteVaultClient {
  return {
    listItems() {
      return requestJson<VaultItemListOutput>(`${baseUrl}/api/vault/items`, undefined, {
        emitUnauthorizedEvent: true,
      });
    },
    async pullSyncSnapshot(input) {
      const query = new URLSearchParams();
      if (input?.snapshotToken) {
        query.set('snapshotToken', input.snapshotToken);
      }
      if (input?.cursor) {
        query.set('cursor', input.cursor);
      }
      if (typeof input?.pageSize === 'number') {
        query.set('pageSize', String(input.pageSize));
      }

      const response = await fetch(
        `${baseUrl}/api/sync/snapshot${query.size > 0 ? `?${query.toString()}` : ''}`,
        {
          credentials: 'include',
          method: 'GET',
          signal: input?.signal,
          headers: {
            ...(input?.etag ? { 'if-none-match': input.etag } : {}),
          },
        },
      );
      if (response.status === 304) {
        return {
          status: 'not_modified',
          etag: typeof response.headers?.get === 'function' ? response.headers.get('etag') : null,
        };
      }

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
        if (response.status === 401) {
          dispatchVaultUnauthorizedEvent({
            source: 'vault',
            status: 401,
            code: responseCode || null,
            message: responseMessage || null,
            url: `${baseUrl}/api/sync/snapshot`,
          });
        }
        throw new Error(
          details
            ? `Request failed with status ${response.status} (${details})`
            : `Request failed with status ${response.status}`,
        );
      }

      const payload = (await response.json()) as SyncSnapshotOutput;
      return {
        status: 'ok',
        etag: typeof response.headers?.get === 'function' ? response.headers.get('etag') : null,
        payload,
      };
    },
    getItem(itemId) {
      return requestJson<VaultItemRecord>(`${baseUrl}/api/vault/items/${itemId}`, undefined, {
        emitUnauthorizedEvent: true,
      });
    },
    createItem(input) {
      return requestJson<VaultItemRecord>(`${baseUrl}/api/vault/items`, {
        method: 'POST',
        body: JSON.stringify(input),
      }, { emitUnauthorizedEvent: true });
    },
    updateItem(input) {
      return requestJson<VaultItemRecord>(`${baseUrl}/api/vault/items/${input.itemId}`, {
        method: 'PUT',
        body: JSON.stringify({
          itemType: input.itemType,
          encryptedPayload: input.encryptedPayload,
          expectedRevision: input.expectedRevision,
        }),
      }, { emitUnauthorizedEvent: true });
    },
    deleteItem(itemId) {
      return requestJson<void>(`${baseUrl}/api/vault/items/${itemId}`, {
        method: 'DELETE',
      }, { emitUnauthorizedEvent: true });
    },
    restoreItem(itemId) {
      return requestJson<VaultItemRestoreOutput>(
        `${baseUrl}/api/vault/items/${itemId}/restore`,
        {
          method: 'POST',
        },
        { emitUnauthorizedEvent: true },
      );
    },
    initAttachmentUpload(input) {
      return requestJson<AttachmentUploadInitOutput>(`${baseUrl}/api/attachments/uploads/init`, {
        method: 'POST',
        body: JSON.stringify(input),
      }, { emitUnauthorizedEvent: true });
    },
    uploadAttachmentContent(uploadId, input) {
      return requestJson<AttachmentUploadRecord>(`${baseUrl}/api/attachments/uploads/${uploadId}/content`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }, { emitUnauthorizedEvent: true });
    },
    finalizeAttachmentUpload(uploadId, itemId) {
      return requestJson<AttachmentUploadFinalizeOutput>(`${baseUrl}/api/attachments/uploads/finalize`, {
        method: 'POST',
        body: JSON.stringify({
          uploadId,
          itemId,
        }),
      }, { emitUnauthorizedEvent: true });
    },
    getAttachmentEnvelope(uploadId) {
      return requestJson<AttachmentUploadEnvelopeOutput>(
        `${baseUrl}/api/attachments/uploads/${encodeURIComponent(uploadId)}/envelope`,
        undefined,
        { emitUnauthorizedEvent: true },
      );
    },
    listAttachmentUploads(itemId) {
      return requestJson<AttachmentUploadListOutput>(
        `${baseUrl}/api/attachments?itemId=${encodeURIComponent(itemId)}`,
        undefined,
        { emitUnauthorizedEvent: true },
      );
    },
    listAttachmentState(input) {
      const query = new URLSearchParams();
      if (typeof input?.cursor === 'string' && input.cursor.length > 0) {
        query.set('cursor', input.cursor);
      }
      if (typeof input?.pageSize === 'number' && Number.isFinite(input.pageSize)) {
        query.set('pageSize', String(Math.max(1, Math.trunc(input.pageSize))));
      }
      return requestJson<AttachmentStateOutput>(
        `${baseUrl}/api/attachments/state${query.size > 0 ? `?${query.toString()}` : ''}`,
        undefined,
        { emitUnauthorizedEvent: true },
      );
    },
  };
}
