const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

function buildHeaders(input = {}) {
  const headers = {
    'content-type': 'application/json',
    ...input.extra,
  };
  if (input.bearerToken) {
    headers.authorization = `Bearer ${input.bearerToken}`;
  }
  return headers;
}

async function requestJson(url, init) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), DEFAULT_REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, {
      credentials: 'omit',
      cache: 'no-store',
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      const timeoutError = new Error('request_timeout');
      timeoutError.code = 'request_timeout';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
  if (!response.ok) {
    let code = '';
    let message = '';
    let interval;
    try {
      const payload = await response.clone().json();
      code = typeof payload.code === 'string' ? payload.code : '';
      message = typeof payload.message === 'string' ? payload.message : '';
      interval = typeof payload.interval === 'number' ? payload.interval : undefined;
    } catch {
      // Keep status-only fallback.
    }
    const detail = message || code || `request_failed_${response.status}`;
    const error = new Error(detail);
    error.code = code;
    error.status = response.status;
    if (typeof interval === 'number') {
      error.interval = interval;
    }
    throw error;
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

async function requestWithNotModified(url, init = {}) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), DEFAULT_REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, {
      credentials: 'omit',
      cache: 'no-store',
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      const timeoutError = new Error('request_timeout');
      timeoutError.code = 'request_timeout';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (response.status === 304) {
    return {
      status: 'not_modified',
      etag: response.headers.get('etag'),
    };
  }

  if (!response.ok) {
    let code = '';
    let message = '';
    let interval;
    try {
      const payload = await response.clone().json();
      code = typeof payload.code === 'string' ? payload.code : '';
      message = typeof payload.message === 'string' ? payload.message : '';
      interval = typeof payload.interval === 'number' ? payload.interval : undefined;
    } catch {
      // Keep status-only fallback.
    }
    const detail = message || code || `request_failed_${response.status}`;
    const error = new Error(detail);
    error.code = code;
    error.status = response.status;
    if (typeof interval === 'number') {
      error.interval = interval;
    }
    throw error;
  }

  return {
    status: 'ok',
    payload: await response.json(),
    etag: response.headers.get('etag'),
  };
}

export function createExtensionApiClient(serverOrigin) {
  const base = serverOrigin.replace(/\/+$/u, '');
  return {
    async getRuntimeMetadata() {
      return requestJson(`${base}/api/runtime/metadata`, {
        method: 'GET',
      });
    },
    async restoreSession(bearerToken) {
      return requestJson(`${base}/api/auth/session/restore`, {
        method: 'GET',
        headers: buildHeaders({ bearerToken }),
      });
    },
    async getRealtimeConnectToken(input = {}) {
      return requestJson(`${base}/api/realtime/connect-token`, {
        method: 'POST',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
        body: JSON.stringify({
          cursor: Number.isFinite(input?.cursor) ? Math.max(0, Math.trunc(input.cursor)) : 0,
        }),
      });
    },
    async getSessionPolicy(bearerToken) {
      return requestJson(`${base}/api/auth/session-policy`, {
        method: 'GET',
        headers: buildHeaders({ bearerToken }),
      });
    },
    async requestUnlockGrant(input) {
      return requestJson(`${base}/api/auth/unlock-grant/request`, {
        method: 'POST',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
        body: JSON.stringify({
          deploymentFingerprint: input?.deploymentFingerprint,
          targetSurface: input?.targetSurface,
          requestPublicKey: input?.requestPublicKey,
          clientNonce: input?.clientNonce,
        }),
      });
    },
    async requestWebBootstrapGrant(input) {
      return requestJson(`${base}/api/auth/web-bootstrap-grant/request`, {
        method: 'POST',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
        body: JSON.stringify({
          deploymentFingerprint: input?.deploymentFingerprint,
          requestPublicKey: input?.requestPublicKey,
          clientNonce: input?.clientNonce,
          webChallenge: input?.webChallenge,
          unlockAccountKey: input?.unlockAccountKey,
        }),
      });
    },
    async consumeWebBootstrapGrant(input) {
      return requestJson(`${base}/api/auth/web-bootstrap-grant/consume`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({
          grantId: input?.grantId,
          requestProof: input?.requestProof,
          consumeNonce: input?.consumeNonce,
        }),
      });
    },
    async listPendingUnlockGrants(input = {}) {
      return requestJson(`${base}/api/auth/unlock-grant/pending`, {
        method: 'GET',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
      });
    },
    async approveUnlockGrant(input) {
      return requestJson(`${base}/api/auth/unlock-grant/approve`, {
        method: 'POST',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
        body: JSON.stringify({
          requestId: input?.requestId,
          approvalNonce: input?.approvalNonce,
          unlockAccountKey: input?.unlockAccountKey,
        }),
      });
    },
    async rejectUnlockGrant(input) {
      return requestJson(`${base}/api/auth/unlock-grant/reject`, {
        method: 'POST',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
        body: JSON.stringify({
          requestId: input?.requestId,
          rejectionReasonCode: input?.rejectionReasonCode,
        }),
      });
    },
    async getUnlockGrantStatus(input) {
      return requestJson(`${base}/api/auth/unlock-grant/status`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({
          requestId: input?.requestId,
          requestProof: input?.requestProof,
        }),
      });
    },
    async consumeUnlockGrant(input) {
      return requestJson(`${base}/api/auth/unlock-grant/consume`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({
          requestId: input?.requestId,
          requestProof: input?.requestProof,
          consumeNonce: input?.consumeNonce,
        }),
      });
    },
    async recoverExtensionSession(input) {
      return requestJson(`${base}/api/auth/extension/session/recover`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({
          deviceId: input?.deviceId,
          sessionRecoverKey: input?.sessionRecoverKey,
        }),
      });
    },
    async fetchSnapshot(input) {
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
      const suffix = query.size > 0 ? `?${query.toString()}` : '';
      return requestJson(`${base}/api/sync/snapshot${suffix}`, {
        method: 'GET',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
      });
    },
    async createVaultItem(input) {
      return requestJson(`${base}/api/extension/vault/items`, {
        method: 'POST',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
        body: JSON.stringify({
          itemType: input?.itemType,
          encryptedPayload: input?.encryptedPayload,
          encryptedDiffPayload:
            typeof input?.encryptedDiffPayload === 'string' && input.encryptedDiffPayload.length > 0
              ? input.encryptedDiffPayload
              : undefined,
        }),
      });
    },
    async updateVaultItem(input) {
      const itemId =
        typeof input?.itemId === 'string' && input.itemId.trim().length > 0 ? input.itemId.trim() : '';
      if (!itemId) {
        const error = new Error('invalid_input');
        error.code = 'invalid_input';
        throw error;
      }
      return requestJson(`${base}/api/extension/vault/items/${encodeURIComponent(itemId)}`, {
        method: 'PUT',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
        body: JSON.stringify({
          itemType: input?.itemType,
          encryptedPayload: input?.encryptedPayload,
          expectedRevision: input?.expectedRevision,
          encryptedDiffPayload:
            typeof input?.encryptedDiffPayload === 'string' && input.encryptedDiffPayload.length > 0
              ? input.encryptedDiffPayload
              : undefined,
        }),
      });
    },
    async deleteVaultItem(input) {
      const itemId =
        typeof input?.itemId === 'string' && input.itemId.trim().length > 0 ? input.itemId.trim() : '';
      if (!itemId) {
        const error = new Error('invalid_input');
        error.code = 'invalid_input';
        throw error;
      }
      return requestJson(`${base}/api/extension/vault/items/${encodeURIComponent(itemId)}`, {
        method: 'DELETE',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
      });
    },
    async restoreVaultItem(input) {
      const itemId =
        typeof input?.itemId === 'string' && input.itemId.trim().length > 0 ? input.itemId.trim() : '';
      if (!itemId) {
        const error = new Error('invalid_input');
        error.code = 'invalid_input';
        throw error;
      }
      return requestJson(`${base}/api/extension/vault/items/${encodeURIComponent(itemId)}/restore`, {
        method: 'POST',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
      });
    },
    async listVaultItemHistory(input = {}) {
      const itemId =
        typeof input?.itemId === 'string' && input.itemId.trim().length > 0 ? input.itemId.trim() : '';
      if (!itemId) {
        const error = new Error('invalid_input');
        error.code = 'invalid_input';
        throw error;
      }
      const query = new URLSearchParams();
      if (Number.isFinite(input?.limit)) {
        query.set('limit', String(Math.max(1, Math.trunc(input.limit))));
      }
      if (typeof input?.cursor === 'string' && input.cursor.length > 0) {
        query.set('cursor', input.cursor);
      }
      const suffix = query.size > 0 ? `?${query.toString()}` : '';
      return requestJson(`${base}/api/vault/items/${encodeURIComponent(itemId)}/history${suffix}`, {
        method: 'GET',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
      });
    },
    async createLinkRequest(input) {
      return requestJson(`${base}/api/auth/extension/link/request`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify(input),
      });
    },
    async getLinkStatus(input) {
      return requestJson(`${base}/api/auth/extension/link/status`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify(input),
      });
    },
    async consumeLinkRequest(input) {
      return requestJson(`${base}/api/auth/extension/link/consume`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify(input),
      });
    },
    async resolveSiteIcons(input) {
      return requestJson(`${base}/api/icons/resolve`, {
        method: 'POST',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
        body: JSON.stringify({
          domains: Array.isArray(input?.domains) ? input.domains : [],
        }),
      });
    },
    async discoverSiteIcons(input) {
      return requestJson(`${base}/api/icons/discover`, {
        method: 'POST',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
        body: JSON.stringify({
          domains: Array.isArray(input?.domains) ? input.domains : [],
          forceRefresh: input?.forceRefresh === true,
        }),
      });
    },
    async getIconsState(input = {}) {
      const query = new URLSearchParams();
      if (Array.isArray(input?.domains) && input.domains.length > 0) {
        query.set('domains', input.domains.join(','));
      }
      const suffix = query.size > 0 ? `?${query.toString()}` : '';
      return requestWithNotModified(`${base}/api/icons/state${suffix}`, {
        method: 'GET',
        headers: buildHeaders({
          bearerToken: input?.bearerToken,
          extra: input?.etag ? { 'if-none-match': input.etag } : {},
        }),
      });
    },
    async putIconDomainsItem(input) {
      return requestJson(`${base}/api/icons/domains/item`, {
        method: 'PUT',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
        body: JSON.stringify({
          itemId: input?.itemId,
          itemRevision: input?.itemRevision,
          hosts: Array.isArray(input?.hosts) ? input.hosts : [],
        }),
      });
    },
    async putIconDomainsBatch(input) {
      return requestJson(`${base}/api/icons/domains/batch`, {
        method: 'POST',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
        body: JSON.stringify({
          entries: Array.isArray(input?.entries)
            ? input.entries.map((entry) => ({
                itemId: entry?.itemId,
                itemRevision: entry?.itemRevision,
                hosts: Array.isArray(entry?.hosts) ? entry.hosts : [],
              }))
            : [],
        }),
      });
    },
    async issueIconObjectTickets(input) {
      return requestJson(`${base}/api/icons/object-tickets`, {
        method: 'POST',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
        body: JSON.stringify({
          objectIds: Array.isArray(input?.objectIds) ? input.objectIds : [],
          ttlSeconds: Number.isFinite(input?.ttlSeconds) ? Math.max(1, Math.trunc(input.ttlSeconds)) : undefined,
        }),
      });
    },
    async listManualSiteIcons(input = {}) {
      return requestWithNotModified(`${base}/api/icons/manual`, {
        method: 'GET',
        headers: buildHeaders({
          bearerToken: input?.bearerToken,
          extra: input?.etag ? { 'if-none-match': input.etag } : {},
        }),
      });
    },
    async upsertManualSiteIcon(input) {
      return requestJson(`${base}/api/icons/manual/upsert`, {
        method: 'POST',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
        body: JSON.stringify({
          domain: input?.domain,
          dataUrl: input?.dataUrl,
          source: input?.source,
        }),
      });
    },
    async removeManualSiteIcon(input) {
      return requestJson(`${base}/api/icons/manual/remove`, {
        method: 'POST',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
        body: JSON.stringify({
          domain: input?.domain,
        }),
      });
    },
    async listPasswordGeneratorHistory(input = {}) {
      return requestJson(`${base}/api/password-generator/history`, {
        method: 'GET',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
      });
    },
    async listFoldersState(input = {}) {
      return requestWithNotModified(`${base}/api/vault/folders/state`, {
        method: 'GET',
        headers: buildHeaders({
          bearerToken: input?.bearerToken,
          extra: input?.etag ? { 'if-none-match': input.etag } : {},
        }),
      });
    },
    async upsertFolder(input = {}) {
      return requestJson(`${base}/api/vault/folders/upsert`, {
        method: 'POST',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
        body: JSON.stringify({
          folderId: input?.folderId,
          name: input?.name,
        }),
      });
    },
    async assignFolder(input = {}) {
      return requestJson(`${base}/api/vault/folders/assign`, {
        method: 'POST',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
        body: JSON.stringify({
          itemId: input?.itemId,
          folderId: typeof input?.folderId === 'string' ? input.folderId : null,
        }),
      });
    },
    async upsertFormMetadata(input = {}) {
      return requestJson(`${base}/api/extension/form-metadata/upsert`, {
        method: 'POST',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
        body: JSON.stringify({
          itemId:
            typeof input?.itemId === 'string' && input.itemId.trim().length > 0 ? input.itemId.trim() : null,
          origin: input?.origin,
          formFingerprint: input?.formFingerprint,
          fieldFingerprint: input?.fieldFingerprint,
          frameScope: input?.frameScope,
          fieldRole: input?.fieldRole,
          selectorCss: input?.selectorCss,
          selectorFallbacks: Array.isArray(input?.selectorFallbacks) ? input.selectorFallbacks : [],
          autocompleteToken:
            typeof input?.autocompleteToken === 'string' && input.autocompleteToken.length > 0
              ? input.autocompleteToken
              : null,
          inputType: typeof input?.inputType === 'string' && input.inputType.length > 0 ? input.inputType : null,
          fieldName: typeof input?.fieldName === 'string' && input.fieldName.length > 0 ? input.fieldName : null,
          fieldId: typeof input?.fieldId === 'string' && input.fieldId.length > 0 ? input.fieldId : null,
          labelTextNormalized:
            typeof input?.labelTextNormalized === 'string' && input.labelTextNormalized.length > 0
              ? input.labelTextNormalized
              : null,
          placeholderNormalized:
            typeof input?.placeholderNormalized === 'string' && input.placeholderNormalized.length > 0
              ? input.placeholderNormalized
              : null,
          confidence: input?.confidence,
          selectorStatus: input?.selectorStatus,
        }),
      });
    },
    async queryFormMetadata(input = {}) {
      return requestJson(`${base}/api/extension/form-metadata/query`, {
        method: 'POST',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
        body: JSON.stringify({
          origins: Array.isArray(input?.origins) ? input.origins : [],
          itemId:
            typeof input?.itemId === 'string' && input.itemId.trim().length > 0 ? input.itemId.trim() : undefined,
        }),
      });
    },
    async initAttachmentUpload(input = {}) {
      return requestJson(`${base}/api/extension/attachments/uploads/init`, {
        method: 'POST',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
        body: JSON.stringify({
          itemId: input?.itemId,
          fileName: input?.fileName,
          contentType: input?.contentType,
          size: input?.size,
          idempotencyKey: input?.idempotencyKey,
        }),
      });
    },
    async uploadAttachmentContent(uploadId, input = {}) {
      return requestJson(`${base}/api/extension/attachments/uploads/${encodeURIComponent(uploadId)}/content`, {
        method: 'PUT',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
        body: JSON.stringify({
          uploadToken: input?.uploadToken,
          encryptedEnvelope: input?.encryptedEnvelope,
        }),
      });
    },
    async finalizeAttachmentUpload(input = {}) {
      return requestJson(`${base}/api/extension/attachments/uploads/finalize`, {
        method: 'POST',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
        body: JSON.stringify({
          uploadId: input?.uploadId,
          itemId: input?.itemId,
        }),
      });
    },
    async listAttachmentState(input = {}) {
      const query = new URLSearchParams();
      if (typeof input?.cursor === 'string' && input.cursor.length > 0) {
        query.set('cursor', input.cursor);
      }
      if (Number.isFinite(input?.pageSize)) {
        query.set('pageSize', String(Math.max(1, Math.trunc(input.pageSize))));
      }
      const suffix = query.size > 0 ? `?${query.toString()}` : '';
      return requestJson(`${base}/api/attachments/state${suffix}`, {
        method: 'GET',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
      });
    },
    async listAttachments(input = {}) {
      const query = new URLSearchParams();
      if (typeof input?.itemId === 'string' && input.itemId.length > 0) {
        query.set('itemId', input.itemId);
      }
      const suffix = query.size > 0 ? `?${query.toString()}` : '';
      return requestJson(`${base}/api/attachments${suffix}`, {
        method: 'GET',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
      });
    },
    async upsertPasswordGeneratorHistoryEntry(input) {
      return requestJson(`${base}/api/password-generator/history/upsert`, {
        method: 'POST',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
        body: JSON.stringify({
          entryId: input?.entryId,
          encryptedPayload: input?.encryptedPayload,
          createdAt: input?.createdAt,
        }),
      });
    },
    async lockSession(input = {}) {
      return requestJson(`${base}/api/auth/session/lock`, {
        method: 'POST',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
        body: JSON.stringify({
          reasonCode: input?.reasonCode,
        }),
      });
    },
  };
}
