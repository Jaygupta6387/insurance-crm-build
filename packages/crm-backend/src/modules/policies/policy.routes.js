const { Router } = require('express');
const controller = require('./policy.controller');
const { authenticate, validateSubscription, requireAdmin } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/permission.middleware');

const router = Router();

router.use(authenticate, validateSubscription);

// Reference / helper endpoints (available to policy creators)
router.get('/policy-types', requirePermission('can_create_policy'), controller.getPolicyTypes);
router.get('/check-number', requirePermission('can_create_policy'), controller.checkPolicyNumber);
router.get('/lookup', requirePermission('can_create_policy'), controller.lookupByNumber);
router.post('/calculate-premium', requirePermission('can_create_policy'), controller.calculatePremium);
router.get('/health-gst', requirePermission('can_create_policy'), controller.getHealthGst);
router.get('/health-plans', requirePermission('can_create_policy'), controller.getHealthPlans);

// Change requests (admin review) — before /:id routes
router.get('/change-requests', requireAdmin, controller.listChangeRequests);
router.post('/change-requests/:requestId/review', requireAdmin, controller.reviewChangeRequest);

// CRUD
router.get('/', requirePermission('can_view_customers'), controller.getPolicies);
router.post('/', requirePermission('can_create_policy'), controller.createPolicy);
router.get('/:id', requirePermission('can_view_customers'), controller.getPolicy);
router.put('/:id', requirePermission('can_edit_policy'), controller.updatePolicy);
router.delete('/:id', requirePermission('can_delete_policy'), controller.deletePolicy);
router.post('/:id/change-requests', requirePermission('can_view_customers'), controller.createChangeRequest);

// Step 5 — commission (privileged)
router.get('/:id/commission', requirePermission('can_manage_policy_commission'), controller.getCommission);
router.post('/:id/commission', requirePermission('can_manage_policy_commission'), controller.finalizeCommission);

module.exports = router;
