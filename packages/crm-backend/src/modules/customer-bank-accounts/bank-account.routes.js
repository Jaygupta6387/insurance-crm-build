const { Router } = require('express');
const controller = require('./bank-account.controller');
const { authenticate, validateSubscription } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/permission.middleware');
const validate = require('../../middleware/validate');
const { createBankAccountSchema, updateBankAccountSchema } = require('../../validators/bank-account.validators');

const router = Router();
router.use(authenticate, validateSubscription);

/**
 * @swagger
 * tags:
 *   name: CustomerBankAccounts
 *   description: Customer bank account management
 */

/**
 * @swagger
 * /customer-bank-accounts:
 *   post:
 *     summary: Add a bank account to a customer
 *     tags: [CustomerBankAccounts]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateBankAccountRequest'
 *     responses:
 *       201:
 *         description: Bank account created
 */
router.post(
  '/',
  requirePermission('can_edit_customer'),
  validate(createBankAccountSchema),
  controller.createBankAccount
);

/**
 * @swagger
 * /customer-bank-accounts/{customerId}:
 *   get:
 *     summary: Get all bank accounts for a customer
 *     tags: [CustomerBankAccounts]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: customerId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: List of bank accounts (account numbers masked)
 */
router.get('/:customerId', requirePermission('can_view_customers'), controller.getBankAccounts);

/**
 * @swagger
 * /customer-bank-accounts/{id}:
 *   put:
 *     summary: Update a bank account
 *     tags: [CustomerBankAccounts]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Updated
 */
router.put(
  '/:id/update',
  requirePermission('can_edit_customer'),
  validate(updateBankAccountSchema),
  controller.updateBankAccount
);

/**
 * @swagger
 * /customer-bank-accounts/{id}:
 *   delete:
 *     summary: Remove a bank account
 *     tags: [CustomerBankAccounts]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Removed
 */
router.delete('/:id', requirePermission('can_edit_customer'), controller.deleteBankAccount);

module.exports = router;
