import { Client } from 'pg';
import { spawn } from 'child_process';
import type { PostgresConfig } from './postgres-installer/index';
import { buildDatabaseUrl } from './postgres-installer/index';
import { getCrmBackendPath } from './app-paths.service';

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

  await adminClient.connect();
  try {
    const userCheck = await adminClient.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [config.user]);
    if (userCheck.rowCount === 0) {
      onProgress('Creating database user…');
      await adminClient.query(`CREATE USER "${config.user}" WITH PASSWORD '${config.password.replace(/'/g, "''")}'`);
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
  onProgress('Running Prisma migrations…');
  const backendPath = getCrmBackendPath();
  const databaseUrl = buildDatabaseUrl(config);

  await execCommand(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['prisma', 'migrate', 'deploy', '--schema=prisma/company.prisma'], {
    cwd: backendPath,
    env: { ...process.env, DATABASE_URL: databaseUrl },
  }, onProgress);

  onProgress('Migrations complete');
};

export const seedAdminUser = async (
  config: PostgresConfig,
  adminEmail: string,
  adminPasswordHash: string,
  adminName: string,
  onProgress: (msg: string) => void
): Promise<void> => {
  onProgress('Seeding admin user…');
  const client = new Client({ connectionString: buildDatabaseUrl(config) });
  await client.connect();
  try {
    await client.query(`
      INSERT INTO "users" ("id", "full_name", "email", "password_hash", "role", "is_active", "must_change_password", "created_at", "updated_at")
      VALUES (gen_random_uuid()::text, $1, $2, $3, 'ADMIN', true, true, NOW(), NOW())
      ON CONFLICT ("email") DO UPDATE SET "password_hash" = EXCLUDED."password_hash", "updated_at" = NOW()
    `, [adminName, adminEmail, adminPasswordHash]);
  } finally {
    await client.end();
  }
  onProgress('Admin user ready');
};

const execCommand = (
  cmd: string,
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv },
  onProgress: (msg: string) => void
): Promise<void> =>
  new Promise((resolve, reject) => {
    onProgress(`Running ${cmd} ${args.join(' ')}…`);
    const child = spawn(cmd, args, {
      ...opts,
      shell: false,
      windowsHide: true,
    });
    child.stdout?.on('data', (d) => onProgress(String(d).trim()));
    child.stderr?.on('data', (d) => onProgress(String(d).trim()));
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });

export { buildDatabaseUrl };
