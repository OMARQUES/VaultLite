import { rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function printHelp() {
  process.stdout.write(
    `Usage: npm run reset:local-state\n\nRemoves local wrangler state used by D1/R2 dev bindings.\nThis does not clear browser cookies or IndexedDB automatically.\n`,
  );
}

async function removeTarget(targetPath) {
  await rm(targetPath, {
    recursive: true,
    force: true,
    maxRetries: 2,
  });
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

await main();
