import type {
  AccountKitSignatureInput,
  AccountKitSignatureOutput,
  OnboardingAccountKitSignInput,
  RemoteAuthenticationChallengeOutput,
  RuntimeMetadata,
  SessionRestoreResponse,
  TrustedSessionResponse,
} from '@vaultlite/contracts';

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  const target = document.cookie
    .split(';')
    .map((segment) => segment.trim())
    .find((segment) => segment.startsWith(prefix));

  return target ? decodeURIComponent(target.slice(prefix.length)) : null;
}

export interface VaultLiteAuthClient {
  getRuntimeMetadata(): Promise<RuntimeMetadata>;
  restoreSession(): Promise<SessionRestoreResponse>;
  requestRemoteAuthenticationChallenge(username: string): Promise<RemoteAuthenticationChallengeOutput>;
  completeRemoteAuthentication(input: {
    username: string;
    deviceId: string;
    authProof: string;
  }): Promise<TrustedSessionResponse>;
  completeOnboarding(input: {
    inviteToken: string;
    username: string;
    authSalt: string;
    authVerifier: string;
    encryptedAccountBundle: string;
    accountKeyWrapped: string;
    deviceId: string;
    deviceName: string;
  }): Promise<TrustedSessionResponse>;
  bootstrapDevice(input: {
    username: string;
    authProof: string;
    deviceName: string;
    devicePlatform: 'web' | 'extension';
  }): Promise<
    TrustedSessionResponse & {
      encryptedAccountBundle: string;
      accountKeyWrapped: string;
      authSalt: string;
    }
  >;
  signOnboardingAccountKit(input: OnboardingAccountKitSignInput): Promise<AccountKitSignatureOutput>;
  signAccountKit(input: AccountKitSignatureInput): Promise<AccountKitSignatureOutput>;
  reissueAccountKit(input: AccountKitSignatureInput): Promise<AccountKitSignatureOutput>;
  verifyAccountKit(input: {
    payload: AccountKitSignatureInput['payload'];
    signature: string;
  }): Promise<{
    status: 'valid' | 'invalid';
  }>;
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: 'include',
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.method && init.method !== 'GET' && readCookie('vl_csrf')
        ? { 'x-csrf-token': readCookie('vl_csrf') ?? '' }
        : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let responseCode = '';
    let responseMessage = '';

    try {
      const errorBody = await response.clone().json() as { code?: string; message?: string };
      responseCode = typeof errorBody.code === 'string' ? errorBody.code : '';
      responseMessage = typeof errorBody.message === 'string' ? errorBody.message : '';
    } catch {
      // Response was not JSON, preserve status-only error below.
    }

    const details = responseMessage || responseCode;
    throw new Error(
      details
        ? `Request failed with status ${response.status} (${details})`
        : `Request failed with status ${response.status}`,
    );
  }

  return response.json() as Promise<T>;
}

export function createVaultLiteAuthClient(baseUrl = ''): VaultLiteAuthClient {
  return {
    getRuntimeMetadata() {
      return requestJson<RuntimeMetadata>(`${baseUrl}/api/runtime/metadata`);
    },
    restoreSession() {
      return requestJson<SessionRestoreResponse>(`${baseUrl}/api/auth/session/restore`);
    },
    requestRemoteAuthenticationChallenge(username) {
      return requestJson<RemoteAuthenticationChallengeOutput>(
        `${baseUrl}/api/auth/remote-authentication/challenge`,
        {
          method: 'POST',
          body: JSON.stringify({ username }),
        },
      );
    },
    completeRemoteAuthentication(input) {
      return requestJson<TrustedSessionResponse>(
        `${baseUrl}/api/auth/remote-authentication/complete`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      );
    },
    completeOnboarding(input) {
      return requestJson<TrustedSessionResponse>(`${baseUrl}/api/auth/onboarding/complete`, {
        method: 'POST',
        body: JSON.stringify({
          inviteToken: input.inviteToken,
          username: input.username,
          authSalt: input.authSalt,
          authVerifier: input.authVerifier,
          encryptedAccountBundle: input.encryptedAccountBundle,
          accountKeyWrapped: input.accountKeyWrapped,
          accountKitExportAcknowledged: true,
          zeroRecoveryAcknowledged: true,
          initialDevice: {
            deviceId: input.deviceId,
            deviceName: input.deviceName,
            platform: 'web',
          },
        }),
      });
    },
    bootstrapDevice(input) {
      return requestJson(`${baseUrl}/api/auth/devices/bootstrap`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    signOnboardingAccountKit(input) {
      return requestJson<AccountKitSignatureOutput>(`${baseUrl}/api/auth/onboarding/account-kit/sign`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    signAccountKit(input) {
      return requestJson<AccountKitSignatureOutput>(`${baseUrl}/api/auth/account-kit/sign`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    reissueAccountKit(input) {
      return requestJson<AccountKitSignatureOutput>(`${baseUrl}/api/auth/account-kit/reissue`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    verifyAccountKit(input) {
      return requestJson(`${baseUrl}/api/auth/account-kit/verify`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
  };
}
