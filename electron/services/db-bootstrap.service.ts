/**
 * Minimal database bootstrap for the Electron main process.
 *
 * Only responsibility: create the PostgreSQL database and user so the CRM
 * backend server can connect. All schema migration, master-data seeding, and
 * licensed-module provisioning is handled by the backend itself (desktop-bootstrap
 * service in New-CRM 2) when it starts up in CRM_MODE=desktop.
 */
import { Client } from 'pg';
import type { PostgresConfig } from './postgres-installer/index';
import { buildDatabaseUrl } from './postgres-installer/index';

export { buildDatabaseUrl };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const isConcurrentPgError = (err: unknown): boolean =>
  /tuple concurrently updated|deadlock detected|could not serialize access/i.test(
    err instanceof Error ? err.message : String(err)
  );

const withPgRetry = async (label: string, fn: () => Promise<void>, retries = 5): Promise<void> => {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      await fn();
      return;
    } catch (err) {
      if (!isConcurrentPgError(err) || attempt === retries - 1) throw err;
      await sleep(250 * (attempt + 1));
    }
  }
};

/**
 * Creates the application PostgreSQL user and database if they don't already
 * exist. Must run before starting the CRM backend server.
 */
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
    await withPgRetry('Database user setup', async () => {
      const userCheck = await adminClient.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [config.user]);
      if (userCheck.rowCount === 0) {
        onProgress('Creating database user…');
        await adminClient.query(
          `CREATE USER "${config.user}" WITH PASSWORD '${config.password.replace(/'/g, "''")}'`
        );
      } else {
        onProgress('Updating database user password…');
        await adminClient.query(
          `ALTER USER "${config.user}" WITH PASSWORD '${config.password.replace(/'/g, "''")}'`
        );
      }
    });

    await withPgRetry('Database creation', async () => {
      const dbCheck = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [config.database]);
      if (dbCheck.rowCount === 0) {
        onProgress('Creating database…');
        await adminClient.query(`CREATE DATABASE "${config.database}" OWNER "${config.user}"`);
      } else {
        onProgress('Database already exists');
      }
    });
  } finally {
    await adminClient.end();
  }
};
