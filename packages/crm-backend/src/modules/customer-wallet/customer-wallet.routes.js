const { Router } = require('express');
const controller = require('./customer-wallet.controller');
const { authenticate, validateSubscription } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/permission.middleware');
const validate = require('../../middleware/validate');
const { adjustCustomerWalletSchema, recordPaymentSchema } = require('../../validators/customer-wallet.validators');

const router = Router();

router.use(authenticate, validateSubscription);

router.get('/pending', requirePermission('can_view_customers'), controller.getPendingBalances);
router.get('/:customerId', requirePermission('can_view_customers'), controller.getCustomerLedger);
router.post(
  '/:customerId/payment',
  requirePermission('can_edit_customer'),
  validate(recordPaymentSchema),
  controller.recordPayment,
);
router.post(
  '/:customerId/adjust',
  requirePermission('can_edit_customer'),
  validate(adjustCustomerWalletSchema),
  controller.adjustWallet,
);

module.exports = router;
