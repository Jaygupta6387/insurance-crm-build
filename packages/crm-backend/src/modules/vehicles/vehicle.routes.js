const { Router } = require('express');
const controller = require('./vehicle.controller');
const { authenticate, validateSubscription } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/permission.middleware');

const router = Router();

router.use(authenticate, validateSubscription);

// RTO auto-resolution from a registration number prefix
router.get('/rto-lookup', requirePermission('can_view_customers'), controller.lookupRto);

// Vehicles are owned by a customer
router.get('/customer/:customerId', requirePermission('can_view_customers'), controller.getVehiclesByCustomer);
router.get('/:id', requirePermission('can_view_customers'), controller.getVehicle);
router.post('/', requirePermission('can_create_policy'), controller.createVehicle);
router.put('/:id', requirePermission('can_create_policy'), controller.updateVehicle);
router.delete('/:id', requirePermission('can_delete_policy'), controller.deleteVehicle);

module.exports = router;
