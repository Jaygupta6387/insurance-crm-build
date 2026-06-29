const { Router } = require('express');
const controller = require('./motor-masters.controller');
const { authenticate, validateSubscription } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/permission.middleware');

const router = Router();

// All motor-masters routes: authenticated + subscription validation
router.use(authenticate, validateSubscription);

// ─── MOTOR MAKES ──────────────────────────────────────────────────────────────
router.get('/motor-makes', requirePermission('can_view_motor_masters'), controller.getMotorMakes);
router.post('/motor-makes', requirePermission('can_create_motor_masters'), controller.createMotorMake);
router.put('/motor-makes/:id', requirePermission('can_edit_motor_masters'), controller.updateMotorMake);
router.delete('/motor-makes/:id', requirePermission('can_delete_motor_masters'), controller.deleteMotorMake);

// ─── MOTOR MODELS ─────────────────────────────────────────────────────────────
router.get('/motor-models', requirePermission('can_view_motor_masters'), controller.getMotorModels);
router.post('/motor-models', requirePermission('can_create_motor_masters'), controller.createMotorModel);
router.put('/motor-models/:id', requirePermission('can_edit_motor_masters'), controller.updateMotorModel);
router.delete('/motor-models/:id', requirePermission('can_delete_motor_masters'), controller.deleteMotorModel);

// ─── MOTOR VARIANTS ───────────────────────────────────────────────────────────
router.get('/motor-variants', requirePermission('can_view_motor_masters'), controller.getMotorVariants);
router.post('/motor-variants', requirePermission('can_create_motor_masters'), controller.createMotorVariant);
router.put('/motor-variants/:id', requirePermission('can_edit_motor_masters'), controller.updateMotorVariant);
router.delete('/motor-variants/:id', requirePermission('can_delete_motor_masters'), controller.deleteMotorVariant);

// ─── RTO CODES ────────────────────────────────────────────────────────────────
router.get('/rto-codes', requirePermission('can_view_motor_masters'), controller.getRtoCodes);
router.post('/rto-codes', requirePermission('can_create_motor_masters'), controller.createRtoCode);
router.put('/rto-codes/:id', requirePermission('can_edit_motor_masters'), controller.updateRtoCode);
router.delete('/rto-codes/:id', requirePermission('can_delete_motor_masters'), controller.deleteRtoCode);

// ─── ADD-ON COVERAGES ─────────────────────────────────────────────────────────
router.get('/add-on-coverages', requirePermission('can_view_motor_masters'), controller.getAddOnCoverages);
router.post('/add-on-coverages', requirePermission('can_create_motor_masters'), controller.createAddOnCoverage);
router.put('/add-on-coverages/:id', requirePermission('can_edit_motor_masters'), controller.updateAddOnCoverage);
router.delete('/add-on-coverages/:id', requirePermission('can_delete_motor_masters'), controller.deleteAddOnCoverage);

module.exports = router;
