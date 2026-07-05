import { Client } from 'pg';
import { existsSync } from 'fs';
import { join } from 'path';
import type { PostgresConfig } from './postgres-installer/index';
import { buildDatabaseUrl } from './postgres-installer/index';
import { getCrmBackendPath } from './app-paths.service';
import { runNodeScript } from './process-spawn.service';

export const createDatabase = async (
  config: PostgresConfig,
  onProgress: (msg: string) => void
): Promise<void> => {
  onProgress('Connecting to PostgreSQL…');
  const adminClient = new Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: 'postgres',
  });

  try {
    await adminClient.connect();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/password authentication failed/i.test(message)) throw err;
    throw new Error(
      `${message}\n\nTry "Reset database & retry" in setup to recreate the local database with matching credentials.`
    );
  }

  try {
    const userCheck = await adminClient.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [config.user]);
    if (userCheck.rowCount === 0) {
      onProgress('Creating database user…');
      await adminClient.query(`CREATE USER "${config.user}" WITH PASSWORD '${config.password.replace(/'/g, "''")}'`);
    } else {
      onProgress('Updating database user password…');
      await adminClient.query(`ALTER USER "${config.user}" WITH PASSWORD '${config.password.replace(/'/g, "''")}'`);
    }

    const dbCheck = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [config.database]);
    if (dbCheck.rowCount === 0) {
      onProgress('Creating database…');
      await adminClient.query(`CREATE DATABASE "${config.database}" OWNER "${config.user}"`);
    } else {
      onProgress('Database already exists');
    }
  } finally {
    await adminClient.end();
  }
};

export const runMigrations = async (
  config: PostgresConfig,
  onProgress: (msg: string) => void
): Promise<void> => {
  onProgress('Running Prisma schema sync…');
  const backendPath = getCrmBackendPath();
  const databaseUrl = buildDatabaseUrl(config);
  const prismaCli = join(backendPath, 'node_modules', 'prisma', 'build', 'index.js');

  if (!existsSync(prismaCli)) {
    throw new Error(
      'Prisma is missing from this install. Download the latest InsureCRM Desktop installer and try again.'
    );
  }

  const result = await runNodeScript(
    prismaCli,
    ['db', 'push', '--schema=prisma/company.prisma', '--skip-generate'],
    {
      cwd: backendPath,
      env: { DATABASE_URL: databaseUrl },
      label: 'Prisma',
    }
  );

  if (result.stdout.trim()) onProgress(result.stdout.trim());
  if (result.stderr.trim()) onProgress(result.stderr.trim());

  onProgress('Seeding default master data…');
  const seedClient = new Client({ connectionString: databaseUrl });
  await seedClient.connect();
  try {
    await seedClient.query(`
      INSERT INTO "policy_types" ("id", "name", "is_active", "created_at", "updated_at")
      SELECT gen_random_uuid()::text, name, true, NOW(), NOW()
      FROM (VALUES ('New'), ('Renew'), ('Port'), ('Used')) AS t(name)
      ON CONFLICT ("name") DO NOTHING;
    `);
    await seedClient.query(`
      INSERT INTO "lobs" ("id", "name", "is_active", "created_at", "updated_at")
      SELECT gen_random_uuid()::text, name, true, NOW(), NOW()
      FROM (VALUES ('MOTOR'), ('HEALTH'), ('LIFE'), ('SME')) AS t(name)
      WHERE NOT EXISTS (SELECT 1 FROM "lobs" LIMIT 1);
    `);
  } finally {
    await seedClient.end();
  }

  onProgress('Migrations complete');
};

import type { SecureStoreData } from './secure-store.service';

const normalizeAdminEmail = (email: string): string => email.trim().toLowerCase();

export const seedAdminUser = async (
  config: PostgresConfig,
  adminEmail: string,
  adminPasswordHash: string,
  adminName: string,
  onProgress: (msg: string) => void,
  options?: { overwritePassword?: boolean }
): Promise<void> => {
  onProgress('Seeding admin user…');
  const email = normalizeAdminEmail(adminEmail);
  const client = new Client({ connectionString: buildDatabaseUrl(config) });
  await client.connect();
  try {
    const conflictClause = options?.overwritePassword
      ? `ON CONFLICT ("email") DO UPDATE SET "password_hash" = EXCLUDED."password_hash", "full_name" = EXCLUDED."full_name", "updated_at" = NOW()`
      : `ON CONFLICT ("email") DO NOTHING`;
    await client.query(`
      INSERT INTO "users" ("id", "full_name", "email", "password_hash", "role", "is_active", "must_change_password", "created_at", "updated_at")
      VALUES (gen_random_uuid()::text, $1, $2, $3, 'ADMIN', true, true, NOW(), NOW())
      ${conflictClause}
    `, [adminName, email, adminPasswordHash]);

    const check = await client.query('SELECT 1 FROM "users" WHERE "email" = $1 LIMIT 1', [email]);
    if (check.rowCount === 0) {
      throw new Error('Admin user could not be created in the local database.');
    }
  } finally {
    await client.end();
  }
  onProgress('Admin user ready');
};

export const syncDesktopAdminFromLicense = async (
  config: PostgresConfig,
  creds: Pick<SecureStoreData, 'adminEmail' | 'adminPasswordHash' | 'adminName' | 'companyName'>,
  onProgress: (msg: string) => void = () => {}
): Promise<void> => {
  if (!creds.adminEmail || !creds.adminPasswordHash) {
    throw new Error('License activation did not return admin credentials.');
  }
  await seedAdminUser(
    config,
    creds.adminEmail,
    creds.adminPasswordHash,
    creds.adminName || creds.companyName || 'Admin',
    onProgress,
    { overwritePassword: true }
  );
};

export { buildDatabaseUrl };
