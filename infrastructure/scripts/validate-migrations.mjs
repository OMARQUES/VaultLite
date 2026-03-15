import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS_DIR = new URL('../migrations/', import.meta.url);
const MIGRATION_FILENAME_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/i;

async function loadMigrations(directory = MIGRATIONS_DIR) {
  const { readdir, readFile } = await import('node:fs/promises');
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((entry) => entry.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  const migrations = [];
  let expectedOrder = 1;

  for (const filename of entries) {
    const match = MIGRATION_FILENAME_PATTERN.exec(filename);
    if (!match) {
      throw new Error(`Invalid migration filename: ${filename}`);
    }

    const order = Number.parseInt(match[1], 10);
    if (order !== expectedOrder) {
      throw new Error(
        `Invalid migration order: expected ${String(expectedOrder).padStart(4, '0')} but found ${filename}`,
      );
    }

    const sql = await readFile(new URL(filename, directory), 'utf8');
    migrations.push({
      id: `${match[1]}_${match[2]}`,
      statements: sql
        .split(';')
        .map((statement) => statement.trim())
        .filter(Boolean)
        .map((statement) => `${statement};`),
    });
    expectedOrder += 1;
  }

  return migrations;
}

function applyStatements(database, statements) {
  for (const statement of statements) {
    database.exec(statement);
  }
}

function assertTables(database) {
  const tables = database
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name ASC`,
    )
    .all()
    .map((row) => row.name);

  const expectedTables = [
    'attachment_blobs',
    'auth_rate_limits',
    'invites',
    'sessions',
    'trusted_devices',
    'user_accounts',
    'vault_item_tombstones',
    'vault_items',
  ];

  if (JSON.stringify(tables) !== JSON.stringify(expectedTables)) {
    throw new Error(`Unexpected schema tables: ${JSON.stringify(tables)}`);
  }
}

async function validateCleanSchema() {
  const migrations = await loadMigrations();
  const database = new DatabaseSync(':memory:');

  try {
    for (const migration of migrations) {
      applyStatements(database, migration.statements);
    }
    assertTables(database);
  } finally {
    database.close();
  }
}

async function validatePartiallyAppliedSchema() {
  const migrations = await loadMigrations();
  const database = new DatabaseSync(':memory:');

  try {
    applyStatements(database, migrations[0].statements);
    for (const migration of migrations.slice(1)) {
      applyStatements(database, migration.statements);
    }
    assertTables(database);
  } finally {
    database.close();
  }
}

async function validateInvalidFilenameDetection() {
  const directory = mkdtempSync(join(tmpdir(), 'vaultlite-migrations-'));
  writeFileSync(join(directory, '0001_initial.sql'), 'CREATE TABLE sample (id TEXT);');
  writeFileSync(join(directory, 'invalid_name.sql'), 'CREATE TABLE broken (id TEXT);');

  try {
    let failedAsExpected = false;
    try {
      await loadMigrations(new URL(`file://${directory.replace(/\\/g, '/')}/`));
    } catch (error) {
      failedAsExpected =
        error instanceof Error && error.message.toLowerCase().includes('invalid migration filename');
    }

    if (!failedAsExpected) {
      throw new Error('Invalid migration filename scenario did not fail as expected');
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function main() {
  await validateCleanSchema();
  await validatePartiallyAppliedSchema();
  await validateInvalidFilenameDetection();
  process.stdout.write('Migration validation passed\n');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
