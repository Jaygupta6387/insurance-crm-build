const { PrismaClient } = require('../../generated/company-client');
const { decryptText } = require('../../utils/cryptoHelper');
const { dbEncryption } = require('../../config/env');
const logger = require('../../config/logger');
const { validateDesktopSubscription } = require('../licensing/desktopHeartbeat.service');

const isDesktopMode = () => process.env.CRM_MODE === 'desktop';

const getSuperAdminClient = () => require('../../prisma/superAdminClient').getSuperAdminClient();

/**
 * Per-slug cache of live PrismaClient instances.
 * Key: company_slug | Value: { client, companyMeta }
 */
const clientCache = new Map();

/** Single cached local client for desktop mode */
let localDesktopClient = null;

/**
 * Decodes a DB password — optionally decrypts if ENCRYPT_DB_CREDENTIALS=true.
 */
const resolvePassword = (rawPassword) => {
  if (dbEncryption.enabled && dbEncryption.key) {
    return decryptText(rawPassword, dbEncryption.key);
  }
  return rawPassword;
};

/**
 * Builds a PostgreSQL connection URL from a company config row.
 */
const buildConnectionUrl = (config) => {
  const user = encodeURIComponent(config.database_user);
  if (config.database_password) {
    const pass = encodeURIComponent(resolvePassword(config.database_password));
    return `postgresql://${user}:${pass}@${config.database_host}:${config.database_port}/${config.database_name}`;
  }
  return `postgresql://${user}@${config.database_host}:${config.database_port}/${config.database_name}`;
};

/**
 * Desktop mode: connect to local PostgreSQL only (no super-admin lookup).
 */
const resolveLocalDesktopDb = async () => {
  if (localDesktopClient) {
    await validateDesktopSubscription();
    return localDesktopClient;
  }

  const url = process.env.DESKTOP_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    throw Object.assign(new Error('Local database not configured'), { statusCode: 503 });
  }

  await validateDesktopSubscription();

  const client = new PrismaClient({
    datasources: { db: { url } },
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

  try {
    await client.$connect();
  } catch (err) {
    logger.error(`Failed to connect to local desktop DB: ${err.message}`);
    throw Object.assign(new Error('Unable to connect to local database'), { statusCode: 503 });
  }

  localDesktopClient = client;
  logger.debug('Desktop local DB client created');
  return client;
};

/**
 * Looks up a company by slug in the Super Admin DB, validates subscription/block status,
 * and returns (or creates + caches) a PrismaClient connected to that company's database.
 *
 * Throws descriptive errors that the auth service maps to HTTP responses.
 */
const resolveCompanyDb = async (companySlug) => {
  if (isDesktopMode()) {
    return resolveLocalDesktopDb();
  }

  // Return cached client to avoid creating a new connection on every request
  if (clientCache.has(companySlug)) {
    const cached = clientCache.get(companySlug);
    // Re-validate subscription/block from DB on every resolution to stay current
    await validateCompanyStatus(cached.companyMeta.id, companySlug);
    return cached.client;
  }

  const superAdmin = getSuperAdminClient();

  const company = await superAdmin.company.findUnique({
    where: { subdomain: companySlug },
  });

  if (!company) {
    throw Object.assign(new Error('Company not found'), { statusCode: 404 });
  }

  if (company.is_blocked) {
    throw Object.assign(new Error('Company account is suspended. Contact support.'), {
      statusCode: 403,
    });
  }

  if (!company.is_active) {
    throw Object.assign(new Error('Company account is inactive. Contact support.'), {
      statusCode: 403,
    });
  }

  if (!company.database_provisioned) {
    throw Object.assign(new Error('Company database is not yet provisioned. Contact support.'), {
      statusCode: 503,
    });
  }

  if (company.subscription_end && new Date(company.subscription_end) < new Date()) {
    throw Object.assign(new Error('Company subscription has expired. Please renew to continue.'), {
      statusCode: 403,
    });
  }

  const connectionUrl = buildConnectionUrl(company);

  const client = new PrismaClient({
    datasources: { db: { url: connectionUrl } },
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

  // Test the connection early
  try {
    await client.$connect();
  } catch (err) {
    logger.error(`Failed to connect to company DB for slug "${companySlug}": ${err.message}`);
    throw Object.assign(new Error('Unable to connect to company database. Contact support.'), {
      statusCode: 503,
    });
  }

  clientCache.set(companySlug, { client, companyMeta: company });
  logger.debug(`Company DB client created and cached for slug: ${companySlug}`);

  return client;
};

/**
 * Re-checks block/subscription status for an already-cached company.
 * Call this on every auth request to detect changes made in the Super Admin panel.
 * Accepts either { id } or { subdomain } for lookup.
 */
const validateCompanyStatus = async (companyId, companySlug) => {
  if (isDesktopMode()) {
    await validateDesktopSubscription();
    return;
  }

  const superAdmin = getSuperAdminClient();
  const where = companyId ? { id: companyId } : { subdomain: companySlug };
  const company = await superAdmin.company.findUnique({ where });

  if (!company || company.is_blocked || !company.is_active) {
    if (companySlug) clientCache.delete(companySlug);
    throw Object.assign(new Error('Company account is suspended. Contact support.'), {
      statusCode: 403,
    });
  }

  if (company.subscription_end && new Date(company.subscription_end) < new Date()) {
    if (companySlug) clientCache.delete(companySlug);
    throw Object.assign(new Error('Company subscription is inactive. Please renew.'), {
      statusCode: 403,
    });
  }
};

/**
 * Evicts a cached company client (e.g. after a DB config change).
 */
const evictCompanyClient = async (companySlug) => {
  const cached = clientCache.get(companySlug);
  if (cached) {
    await cached.client.$disconnect();
    clientCache.delete(companySlug);
    logger.debug(`Company DB client evicted for slug: ${companySlug}`);
  }
};

/**
 * Gracefully disconnects all cached company clients.
 * Called during server shutdown.
 */
const disconnectAllCompanyClients = async () => {
  const promises = [...clientCache.values()].map(({ client }) => client.$disconnect());
  if (localDesktopClient) {
    promises.push(localDesktopClient.$disconnect());
    localDesktopClient = null;
  }
  await Promise.allSettled(promises);
  clientCache.clear();
  logger.debug('All company DB clients disconnected');
};

module.exports = {
  resolveCompanyDb,
  evictCompanyClient,
  disconnectAllCompanyClients,
  validateCompanyStatus,
  isDesktopMode,
};
