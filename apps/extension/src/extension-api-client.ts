import type {
  ExtensionLinkConsumeOutput,
  SessionRestoreResponse,
  SyncSnapshotOutput,
} from '@vaultlite/contracts';

function buildHeaders(input: { bearerToken?: string | null; extra?: HeadersInit }): HeadersInit {
  return {
    'content-type': 'application/json',
    ...(input.bearerToken ? { authorization: `Bearer ${input.bearerToken}` } : {}),
    ...(input.extra ?? {}),
  };
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    let code = '';
    try {
      const payload = (await response.clone().json()) as { code?: string };
      code = payload.code ?? '';
    } catch {
      // noop
    }
    throw new Error(code || `request_failed_${response.status}`);
  }
  return response.json() as Promise<T>;
}

export interface ExtensionApiClient {
  consumeLinkRequest(input: {
    requestId: string;
    requestProof: { nonce: string; signature: string };
    consumeNonce: string;
  }): Promise<ExtensionLinkConsumeOutput>;
  restoreSession(bearerToken?: string | null): Promise<SessionRestoreResponse>;
  fetchSnapshot(bearerToken: string): Promise<SyncSnapshotOutput>;
}

export function createExtensionApiClient(serverOrigin: string): ExtensionApiClient {
  return {
    consumeLinkRequest(input) {
      return requestJson<ExtensionLinkConsumeOutput>(
        `${serverOrigin}/api/auth/extension/link/consume`,
        {
          method: 'POST',
          headers: buildHeaders({}),
          body: JSON.stringify(input),
        },
      );
    },
    restoreSession(bearerToken) {
      return requestJson<SessionRestoreResponse>(`${serverOrigin}/api/auth/session/restore`, {
        headers: buildHeaders({ bearerToken: bearerToken ?? null }),
      });
    },
    fetchSnapshot(bearerToken) {
      return requestJson<SyncSnapshotOutput>(`${serverOrigin}/api/sync/snapshot`, {
        headers: buildHeaders({ bearerToken }),
      });
    },
  };
}
