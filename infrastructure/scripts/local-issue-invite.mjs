const DEFAULT_API_ORIGIN = process.env.VAULTLITE_LOCAL_API_ORIGIN ?? 'http://127.0.0.1:8787';
const DEFAULT_BOOTSTRAP_ADMIN_TOKEN =
  process.env.VAULTLITE_BOOTSTRAP_ADMIN_TOKEN ?? 'development-bootstrap-admin-token';
const DEFAULT_EXPIRY_MINUTES = Number.parseInt(process.env.VAULTLITE_INVITE_EXPIRY_MINUTES ?? '60', 10);

function parseExpiryMinutes() {
  const candidate = Number.parseInt(process.argv[2] ?? `${DEFAULT_EXPIRY_MINUTES}`, 10);
  return Number.isFinite(candidate) && candidate > 0 ? candidate : DEFAULT_EXPIRY_MINUTES;
}

async function main() {
  const expiresAt = new Date(Date.now() + parseExpiryMinutes() * 60_000).toISOString();
  const response = await fetch(`${DEFAULT_API_ORIGIN}/api/auth/invites`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-bootstrap-admin-token': DEFAULT_BOOTSTRAP_ADMIN_TOKEN,
    },
    body: JSON.stringify({ expiresAt }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Invite issuance failed with status ${response.status}: ${body}`);
  }

  const payload = await response.json();
  process.stdout.write(`${payload.inviteToken}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
