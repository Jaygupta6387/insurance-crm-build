const { Router } = require('express');
const authRoutes = require('../modules/auth/auth.routes');
const employeeRoutes = require('../modules/employees/employee.routes');
const permissionRoutes = require('../modules/permissions/permission.routes');
const customerRoutes = require('../modules/customers/customer.routes');
const subBrokerRoutes = require('../modules/sub-brokers/subbroker.routes');
const masterDataRoutes = require('../modules/masterdata/masterdata.routes');
const bankAccountRoutes = require('../modules/customer-bank-accounts/bank-account.routes');
const documentRoutes = require('../modules/customer-documents/document.routes');
const motorMastersRoutes = require('../modules/motor-masters/motor-masters.routes');
const leadRoutes = require('../modules/leads/lead.routes');
const vehicleRoutes = require('../modules/vehicles/vehicle.routes');
const policyRoutes = require('../modules/policies/policy.routes');
const customerWalletRoutes = require('../modules/customer-wallet/customer-wallet.routes');
const { sendNotFound } = require('../utils/responseHelper');

const router = Router();

// ─── Health check ─────────────────────────────────────────────────────────────
router.get('/health', (req, res) =>
  res.json({ success: true, message: 'CRM API is running', timestamp: new Date().toISOString() })
);

// ─── Feature routes ───────────────────────────────────────────────────────────
router.use('/auth', authRoutes);
router.use('/employees', employeeRoutes);
router.use('/permissions', permissionRoutes);
router.use('/customers', customerRoutes);
router.use('/sub-brokers', subBrokerRoutes);
router.use('/master', masterDataRoutes);
router.use('/customer-bank-accounts', bankAccountRoutes);
router.use('/customer-documents', documentRoutes);
router.use('/motor-masters', motorMastersRoutes);
router.use('/leads', leadRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/policies', policyRoutes);
router.use('/customer-wallet', customerWalletRoutes);

// ─── 404 fallback ─────────────────────────────────────────────────────────────
router.use((req, res) => sendNotFound(res, `Route ${req.method} ${req.originalUrl} not found`));

module.exports = router;
