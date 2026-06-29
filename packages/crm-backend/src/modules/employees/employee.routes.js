const { Router } = require('express');
const controller = require('./employee.controller');
const { authenticate, validateSubscription, requireAdmin } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/permission.middleware');
const validate = require('../../middleware/validate');
const {
  createEmployeeSchema,
  updateEmployeeSchema,
} = require('../../validators/employee.validators');

const router = Router();

// All employee routes require authentication + active subscription
router.use(authenticate, validateSubscription);

/**
 * @swagger
 * tags:
 *   name: Employees
 *   description: Employee management — Admin only
 */

/**
 * @swagger
 * /employees:
 *   post:
 *     summary: Create a new employee
 *     tags: [Employees]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateEmployeeRequest'
 *     responses:
 *       201:
 *         description: Employee created — credentials sent via email
 *       409:
 *         description: Email already in use
 */
router.post(
  '/',
  requirePermission('can_create_employee'),
  validate(createEmployeeSchema),
  controller.createEmployee
);

/**
 * @swagger
 * /employees:
 *   get:
 *     summary: List all employees
 *     tags: [Employees]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Array of employees with permissions
 */
router.get('/', controller.getEmployees);

/**
 * @swagger
 * /employees/{id}:
 *   get:
 *     summary: Get a single employee
 *     tags: [Employees]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Employee profile
 *       404:
 *         description: Employee not found
 */
router.get('/:id', controller.getEmployee);

/**
 * @swagger
 * /employees/{id}:
 *   put:
 *     summary: Update an employee
 *     tags: [Employees]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name:
 *                 type: string
 *               phone:
 *                 type: string
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Employee updated
 */
router.put(
  '/:id',
  requirePermission('can_edit_employee'),
  validate(updateEmployeeSchema),
  controller.updateEmployee
);

/**
 * @swagger
 * /employees/{id}:
 *   patch:
 *     summary: Partial update of an employee
 *     tags: [Employees]
 */
router.patch(
  '/:id',
  requirePermission('can_edit_employee'),
  validate(updateEmployeeSchema),
  controller.updateEmployee
);

/**
 * @swagger
 * /employees/{id}/block:
 *   patch:
 *     summary: Block an employee account
 *     tags: [Employees]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Employee blocked
 */
router.patch('/:id/block', requireAdmin, controller.blockEmployee);

/**
 * @swagger
 * /employees/{id}/unblock:
 *   patch:
 *     summary: Unblock an employee account
 *     tags: [Employees]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Employee unblocked
 */
router.patch('/:id/unblock', requireAdmin, controller.unblockEmployee);

/**
 * @swagger
 * /employees/{id}:
 *   delete:
 *     summary: Permanently delete an employee
 *     tags: [Employees]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Employee deleted
 */
router.delete('/:id', requirePermission('can_delete_employee'), controller.deleteEmployee);

module.exports = router;
