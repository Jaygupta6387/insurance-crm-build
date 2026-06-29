const { Router } = require('express');
const controller = require('./lead.controller');
const { authenticate, validateSubscription } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/permission.middleware');
const validate = require('../../middleware/validate');
const { createLeadSchema, updateLeadSchema } = require('../../validators/lead.validators');

const router = Router();
router.use(authenticate, validateSubscription);

router.post(
  '/',
  requirePermission('can_create_customer'),
  validate(createLeadSchema),
  controller.createLead
);

router.get('/', requirePermission('can_view_customers'), controller.getLeads);

router.get('/:id', requirePermission('can_view_customers'), controller.getLead);

router.put(
  '/:id',
  requirePermission('can_edit_customer'),
  validate(updateLeadSchema),
  controller.updateLead
);

router.patch('/:id/convert', requirePermission('can_edit_customer'), controller.convertLead);

router.delete('/:id', requirePermission('can_delete_customer'), controller.deleteLead);

module.exports = router;
