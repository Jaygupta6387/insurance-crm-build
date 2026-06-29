const { PrismaClient } = require('../generated/superadmin-client');
const logger = require('../config/logger');

let client;

/**
 * Returns the singleton PrismaClient for the Super Admin database.
 * Lazy-initialised on first access.
 */
const getSuperAdminClient = () => {
  if (!client) {
    client = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
    logger.debug('SuperAdmin PrismaClient initialised');
  }
  return client;
};

const disconnectSuperAdmin = async () => {
  if (client) {
    await client.$disconnect();
    client = null;
    logger.debug('SuperAdmin PrismaClient disconnected');
  }
};

module.exports = { getSuperAdminClient, disconnectSuperAdmin };
