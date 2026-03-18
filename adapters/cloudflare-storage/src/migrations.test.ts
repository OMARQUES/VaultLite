import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, test, vi } from 'vitest';

import {
  applyCloudflareMigrations,
  getInfrastructureMigrationDirectory,
  loadCloudflareMigrations,
} from './index';

describe('cloudflare migration loading', () => {
  test('loads migrations from the shared infrastructure directory in stable order', async () => {
    const migrations = await loadCloudflareMigrations();
    const migrationsDirectory = getInfrastructureMigrationDirectory();

    expect(
      migrationsDirectory instanceof URL ? migrationsDirectory.pathname : migrationsDirectory,
    ).toContain('infrastructure');
    expect(migrations.length).toBeGreaterThan(0);
    expect(migrations.map((migration) => migration.id)).toEqual([
      '0001_initial',
      '0002_vault_items',
      '0003_vault_item_tombstones',
      '0004_attachment_upload_pending',
      '0005_bootstrap_admin_foundation',
    ]);
    expect(migrations[0]?.statements.length).toBeGreaterThan(1);
  });

  test('applies loaded migrations statement-by-statement in order', async () => {
    const run = vi.fn().mockResolvedValue(undefined);

    await applyCloudflareMigrations({
      prepare(statement: string) {
        return {
          bind() {
            return this;
          },
          first() {
            throw new Error(`Unexpected first() for ${statement}`);
          },
          all() {
            throw new Error(`Unexpected all() for ${statement}`);
          },
          run,
        };
      },
      exec() {
        throw new Error('Unexpected exec() in migration test');
      },
    });

    const migrations = await loadCloudflareMigrations();
    expect(run).toHaveBeenCalledTimes(
      migrations.reduce((count, migration) => count + migration.statements.length, 0),
    );
    expect(run.mock.calls.length).toBeGreaterThan(migrations.length);
  });

  test('rejects invalid migration filenames before applying anything', async () => {
    const invalidDirectory = mkdtempSync(join(tmpdir(), 'vaultlite-migrations-'));
    writeFileSync(join(invalidDirectory, '0001_initial.sql'), 'CREATE TABLE sample (id TEXT);');
    writeFileSync(join(invalidDirectory, 'bad_name.sql'), 'CREATE TABLE invalid_name (id TEXT);');

    try {
      await expect(loadCloudflareMigrations(invalidDirectory)).rejects.toThrow(
        /Invalid migration filename/i,
      );
    } finally {
      rmSync(invalidDirectory, { recursive: true, force: true });
    }
  });
});
