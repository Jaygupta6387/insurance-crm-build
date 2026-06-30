const axios = require('axios');
const logger = require('../../config/logger');

const CLOUD_API_URL = process.env.LICENSE_CLOUD_API_URL || process.env.SUPER_ADMIN_API_URL || 'http://localhost:5001/api';
const HEARTBEAT_INTERVAL_MS = parseInt(process.env.LICENSE_HEARTBEAT_INTERVAL_MS || '3600000', 10);

let lastHeartbeat = null;
let lastHeartbeatOk = true;
let lastHeartbeatError = null;

/**
 * Calls cloud license heartbeat. Used in CRM_MODE=desktop instead of super-admin DB lookup.
 */
const heartbeat = async (licenseToken) => {
  if (!licenseToken) {
    lastHeartbeatOk = false;
    lastHeartbeatError = 'No license token configured';
    throw Object.assign(new Error(lastHeartbeatError), { statusCode: 403 });
  }

  try {
    const res = await axios.post(
      `${CLOUD_API_URL}/licenses/heartbeat`,
      { machine_hash: process.env.DESKTOP_MACHINE_HASH || '' },
      {
        headers: { Authorization: `Bearer ${licenseToken}` },
        timeout: 15000,
      }
    );
    lastHeartbeat = Date.now();
    lastHeartbeatOk = true;
    lastHeartbeatError = null;
    return res.data?.data || res.data;
  } catch (err) {
    lastHeartbeatOk = false;
    lastHeartbeatError = err.response?.data?.message || err.message;
    logger.warn(`License heartbeat failed: ${lastHeartbeatError}`);
    throw Object.assign(new Error(lastHeartbeatError || 'License validation failed'), {
      statusCode: err.response?.status || 403,
    });
  }
};

/**
 * Validates subscription via cached heartbeat or fresh call if stale.
 */
const validateDesktopSubscription = async () => {
  const token = process.env.DESKTOP_LICENSE_TOKEN;
  if (!token) {
    throw Object.assign(new Error('No license token configured'), { statusCode: 403 });
  }

  const stale = !lastHeartbeat || Date.now() - lastHeartbeat > HEARTBEAT_INTERVAL_MS;
  if (!stale && lastHeartbeatOk) return;

  try {
    await heartbeat(token);
  } catch (err) {
    // Desktop CRM runs locally — do not block login/API when cloud is slow or offline.
    logger.warn(`Background license heartbeat failed: ${lastHeartbeatError || err.message}`);
  }
};

const getHeartbeatStatus = () => ({
  ok: lastHeartbeatOk,
  lastAt: lastHeartbeat,
  error: lastHeartbeatError,
});

module.exports = { heartbeat, validateDesktopSubscription, getHeartbeatStatus };
