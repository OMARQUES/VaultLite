import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

const API_ORIGIN = process.env.VAULTLITE_LOCAL_API_ORIGIN ?? 'http://127.0.0.1:8787';
const WEB_ORIGIN = process.env.VAULTLITE_LOCAL_WEB_ORIGIN ?? 'http://127.0.0.1:5173';
const BOOTSTRAP_ADMIN_TOKEN =
  process.env.VAULTLITE_BOOTSTRAP_ADMIN_TOKEN ?? 'development-bootstrap-admin-token';

function createRunner(command, args, name) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[${name}] ${chunk}`);
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[${name}] ${chunk}`);
  });

  return child;
}

async function stopRunner(child) {
  if (!child.pid || child.exitCode !== null) {
    return;
  }

  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', `${child.pid}`, '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    await once(killer, 'exit');
  } else {
    child.kill('SIGTERM');
    await Promise.race([
      once(child, 'exit'),
      delay(3_000).then(() => {
        if (child.exitCode === null) {
          child.kill('SIGKILL');
        }
      }),
    ]);
  }

  child.stdout?.destroy();
  child.stderr?.destroy();
}

function createNpmRunner(args, name) {
  if (process.platform === 'win32') {
    return createRunner('cmd.exe', ['/d', '/s', '/c', 'npm', ...args], name);
  }

  return createRunner('npm', args, name);
}

async function waitForUrl(url, timeoutMs = 30_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Process still booting.
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function isUrlReady(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

function extractCookies(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(';', 1)[0])
      .join('; ');
  }

  const header = response.headers.get('set-cookie');
  if (!header) {
    return '';
  }

  return header
    .split(',')
    .map((cookie) => cookie.split(';', 1)[0].trim())
    .join('; ');
}

async function runLocalFlowSmoke() {
  const startedRunners = [];
  const api = (await isUrlReady(`${API_ORIGIN}/api/health`))
    ? null
    : createNpmRunner(['run', 'dev:api'], 'api');
  const web = (await isUrlReady(`${WEB_ORIGIN}/`))
    ? null
    : createNpmRunner(['run', 'dev:web'], 'web');

  if (api) {
    startedRunners.push(api);
  }
  if (web) {
    startedRunners.push(web);
  }

  const shutdown = () => {
    void Promise.allSettled(startedRunners.map((runner) => stopRunner(runner)));
  };

  process.on('SIGINT', () => {
    shutdown();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    shutdown();
    process.exit(143);
  });

  try {
    await waitForUrl(`${API_ORIGIN}/api/health`);
    await waitForUrl(`${WEB_ORIGIN}/`);
    const proxiedHealth = await fetch(`${WEB_ORIGIN}/api/health`);
    if (!proxiedHealth.ok) {
      throw new Error(`Vite proxy health check failed with status ${proxiedHealth.status}`);
    }
    const runtimeMetadataResponse = await fetch(`${WEB_ORIGIN}/api/runtime/metadata`);
    if (!runtimeMetadataResponse.ok) {
      throw new Error(`Runtime metadata through proxy failed with status ${runtimeMetadataResponse.status}`);
    }
    const runtimeMetadata = await runtimeMetadataResponse.json();

    const inviteResponse = await fetch(`${WEB_ORIGIN}/api/auth/invites`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-bootstrap-admin-token': BOOTSTRAP_ADMIN_TOKEN,
      },
      body: JSON.stringify({
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    });
    if (!inviteResponse.ok) {
      throw new Error(`Invite issuance through proxy failed with status ${inviteResponse.status}`);
    }
    const invite = await inviteResponse.json();
    const username = `local_smoke_${Date.now()}`;

    const signResponse = await fetch(`${WEB_ORIGIN}/api/auth/onboarding/account-kit/sign`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        inviteToken: invite.inviteToken,
        username,
        payload: {
          version: 'account-kit.v1',
          serverUrl: runtimeMetadata.serverUrl,
          username,
          accountKey: 'A'.repeat(43),
          deploymentFingerprint: runtimeMetadata.deploymentFingerprint,
          issuedAt: new Date().toISOString(),
        },
      }),
    });
    if (!signResponse.ok) {
      throw new Error(`Onboarding account kit signing through proxy failed with status ${signResponse.status}`);
    }
    const signedAccountKit = await signResponse.json();
    if (!signedAccountKit.signature) {
      throw new Error('Onboarding account kit signing did not return a signature');
    }

    const onboardingResponse = await fetch(`${WEB_ORIGIN}/api/auth/onboarding/complete`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        inviteToken: invite.inviteToken,
        username,
        authSalt: 'smoke_auth_salt',
        authVerifier: 'smoke_auth_verifier',
        encryptedAccountBundle: 'smoke_encrypted_bundle',
        accountKeyWrapped: 'smoke_wrapped_account_key',
        accountKitExportAcknowledged: true,
        zeroRecoveryAcknowledged: true,
        initialDevice: {
          deviceId: `device_${Date.now()}`,
          deviceName: 'Local Smoke Device',
          platform: 'web',
        },
      }),
    });
    if (!onboardingResponse.ok) {
      throw new Error(`Onboarding through proxy failed with status ${onboardingResponse.status}`);
    }

    const cookieHeader = extractCookies(onboardingResponse);
    if (!cookieHeader.includes('vl_session=') || !cookieHeader.includes('vl_csrf=')) {
      throw new Error('Onboarding response did not include expected session cookies');
    }

    const restoreResponse = await fetch(`${WEB_ORIGIN}/api/auth/session/restore`, {
      headers: {
        cookie: cookieHeader,
      },
    });
    if (!restoreResponse.ok) {
      throw new Error(`Session restoration through proxy failed with status ${restoreResponse.status}`);
    }

    const restoredSession = await restoreResponse.json();
    if (restoredSession.sessionState !== 'local_unlock_required') {
      throw new Error(
        `Expected local_unlock_required after onboarding, received ${restoredSession.sessionState}`,
      );
    }

    const csrfToken = cookieHeader
      .split('; ')
      .find((entry) => entry.startsWith('vl_csrf='))
      ?.split('=', 2)[1];
    if (!csrfToken) {
      throw new Error('Expected vl_csrf cookie after onboarding');
    }

    const reissueResponse = await fetch(`${WEB_ORIGIN}/api/auth/account-kit/reissue`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: cookieHeader,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        payload: {
          version: 'account-kit.v1',
          serverUrl: runtimeMetadata.serverUrl,
          username,
          accountKey: 'A'.repeat(43),
          deploymentFingerprint: runtimeMetadata.deploymentFingerprint,
          issuedAt: new Date().toISOString(),
        },
      }),
    });
    if (!reissueResponse.ok) {
      throw new Error(`Account kit reissue through proxy failed with status ${reissueResponse.status}`);
    }

    process.stdout.write('Local web + API smoke flow passed.\n');
  } finally {
    await Promise.allSettled(startedRunners.map((runner) => stopRunner(runner)));
  }
}

runLocalFlowSmoke().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
