const { Router } = require('express');
const controller = require('./customer.controller');
const { authenticate, validateSubscription } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/permission.middleware');
const validate = require('../../middleware/validate');
const { createCustomerSchema, updateCustomerSchema } = require('../../validators/customer.validators');

const router = Router();
router.use(authenticate, validateSubscription);

/**
 * @swagger
 * tags:
 *   name: Customers
 *   description: Customer management
 */

/**
 * @swagger
 * /customers/generate-family-code:
 *   get:
 *     summary: Generate a family code from name + phone
 *     tags: [Customers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: name
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: phone
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Family code generated
 */
router.get('/generate-family-code', controller.generateFamilyCode);

/**
 * @swagger
 * /customers/lookup-family-code:
 *   get:
 *     summary: Look up customers sharing a family code
 *     tags: [Customers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: family_code
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of customers with the given family code
 *       404:
 *         description: No customers found for that code
 */
router.get('/lookup-family-code', controller.lookupFamilyCode);

/**
 * @swagger
 * /customers/search-family-codes:
 *   get:
 *     summary: Search family codes with family head names
 *     tags: [Customers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string, minLength: 2 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 20 }
 *     responses:
 *       200:
 *         description: Matching family codes
 */
router.get('/search-family-codes', controller.searchFamilyCodes);

/**
 * @swagger
 * /customers:
 *   post:
 *     summary: Create a new customer
 *     tags: [Customers]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCustomerRequest'
 *     responses:
 *       201:
 *         description: Customer created
 *       403:
 *         description: Permission denied
 */
router.post(
  '/',
  requirePermission('can_create_customer'),
  validate(createCustomerSchema),
  controller.createCustomer
);

/**
 * @swagger
 * /customers:
 *   get:
 *     summary: List customers (with search + filter + pagination)
 *     tags: [Customers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, INACTIVE, PROSPECT, BLOCKED] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Customer list with pagination
 */
router.get('/', requirePermission('can_view_customers'), controller.getCustomers);

/**
 * @swagger
 * /customers/{id}:
 *   get:
 *     summary: Get a single customer by ID
 *     tags: [Customers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Customer details
 *       404:
 *         description: Not found
 */
router.get('/:id', requirePermission('can_view_customers'), controller.getCustomer);

/**
 * @swagger
 * /customers/{id}:
 *   put:
 *     summary: Update a customer
 *     tags: [Customers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCustomerRequest'
 *     responses:
 *       200:
 *         description: Customer updated
 */
router.put(
  '/:id',
  requirePermission('can_edit_customer'),
  validate(updateCustomerSchema),
  controller.updateCustomer
);

/**
 * @swagger
 * /customers/{id}:
 *   delete:
 *     summary: Soft-delete a customer (Admin only)
 *     tags: [Customers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Customer deleted
 *       403:
 *         description: Admins only
 */
router.delete('/:id', requirePermission('can_delete_customer'), controller.deleteCustomer);

module.exports = router;
