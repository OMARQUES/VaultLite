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
    async listManualSiteIcons(input = {}) {
      return requestJson(`${base}/api/icons/manual`, {
        method: 'GET',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
      });
    },
    async upsertManualSiteIcon(input) {
      return requestJson(`${base}/api/icons/manual/upsert`, {
        method: 'POST',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
        body: JSON.stringify(input),
      });
    },
    async removeManualSiteIcon(input) {
      return requestJson(`${base}/api/icons/manual/remove`, {
        method: 'POST',
        headers: buildHeaders({ bearerToken: input?.bearerToken }),
        body: JSON.stringify(input),
      });
    },
  };
}
