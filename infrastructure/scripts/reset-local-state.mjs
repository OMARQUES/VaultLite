import { rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const RETRYABLE_LOCK_CODES = new Set(['EBUSY', 'EPERM', 'ENOTEMPTY']);
const MAX_REMOVE_ATTEMPTS = 8;

function printHelp() {
  process.stdout.write(
    `Usage: npm run reset:local-state\n\nRemoves local wrangler state used by D1/R2 dev bindings.\nThis does not clear browser cookies or IndexedDB automatically.\n`,
  );
}

function isRetryableLockError(error) {
  return (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string' &&
    RETRYABLE_LOCK_CODES.has(error.code)
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeTarget(targetPath) {
  for (let attempt = 1; attempt <= MAX_REMOVE_ATTEMPTS; attempt += 1) {
    try {
      await rm(targetPath, {
        recursive: true,
        force: true,
        maxRetries: 0,
      });
      return;
    } catch (error) {
      if (!isRetryableLockError(error) || attempt === MAX_REMOVE_ATTEMPTS) {
        throw error;
      }
      const delayMs = Math.min(2000, 200 * 2 ** (attempt - 1));
      process.stdout.write(
        `[reset:local-state] locked (${error.code}) at ${targetPath}. retry ${attempt}/${MAX_REMOVE_ATTEMPTS} in ${delayMs}ms...\n`,
      );
      await sleep(delayMs);
    }
  }
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp();
    return;
  }

  const root = process.cwd();
  const targets = ['.wrangler/state', '.wrangler/tmp'].map((relativePath) =>
    path.join(root, relativePath),
  );

  for (const target of targets) {
    await removeTarget(target);
    process.stdout.write(`[reset:local-state] removed ${path.relative(root, target)}\n`);
  }

  process.stdout.write(
    '[reset:local-state] local worker state cleared. Clear browser site data for http://127.0.0.1:5173 to remove cookies and IndexedDB (vaultlite-trusted-state).\n',
  );
}

try {
  await main();
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNKNOWN';
  process.stderr.write(
    `[reset:local-state] failed with ${code}. Stop local dev processes (wrangler/workerd), close tabs using local app, and retry.\n`,
  );
  process.stderr.write(
    '[reset:local-state] Windows helper: taskkill /IM workerd.exe /F & taskkill /IM node.exe /F (only if you do not need active dev sessions).\n',
  );
  throw error;
}
