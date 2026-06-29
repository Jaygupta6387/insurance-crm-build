const { Router } = require('express');
const controller = require('./subbroker.controller');
const { authenticate, validateSubscription, requireAdmin } = require('../../middleware/auth.middleware');
const validate = require('../../middleware/validate');
const {
  createSubBrokerSchema,
  updateSubBrokerSchema,
  walletAdjustmentSchema,
  createCommissionSchema,
  updateCommissionStatusSchema,
} = require('../../validators/subbroker.validators');

const router = Router();

// All sub-broker routes: authenticated + active subscription + Admin only
router.use(authenticate, validateSubscription, requireAdmin);

/**
 * @swagger
 * tags:
 *   name: SubBrokers
 *   description: Sub-broker management — wallet, commissions, and analytics (Admin only)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     SubBroker:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *         email:
 *           type: string
 *           format: email
 *           nullable: true
 *         phone:
 *           type: string
 *           nullable: true
 *         aadhaar_number:
 *           type: string
 *           nullable: true
 *         is_active:
 *           type: boolean
 *         wallet_balance:
 *           type: number
 *           format: double
 *         created_at:
 *           type: string
 *           format: date-time
 *
 *     CreateSubBrokerRequest:
 *       type: object
 *       required: [name]
 *       properties:
 *         name:
 *           type: string
 *           minLength: 2
 *         email:
 *           type: string
 *           format: email
 *         phone:
 *           type: string
 *         aadhaar_number:
 *           type: string
 *
 *     WalletAdjustmentRequest:
 *       type: object
 *       required: [amount, type, reason]
 *       properties:
 *         amount:
 *           type: number
 *           format: double
 *           minimum: 0.01
 *         type:
 *           type: string
 *           enum: [CREDIT, DEBIT]
 *         reason:
 *           type: string
 *
 *     WalletTransaction:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         type:
 *           type: string
 *           enum: [CREDIT, DEBIT]
 *         amount:
 *           type: number
 *           format: double
 *         balance_after:
 *           type: number
 *           format: double
 *         reason:
 *           type: string
 *           nullable: true
 *         policy_id:
 *           type: string
 *           format: uuid
 *           nullable: true
 *         customer_id:
 *           type: string
 *           format: uuid
 *           nullable: true
 *         lob_id:
 *           type: string
 *           format: uuid
 *           nullable: true
 *         product_id:
 *           type: string
 *           format: uuid
 *           nullable: true
 *         sub_product_id:
 *           type: string
 *           format: uuid
 *           nullable: true
 *         insurance_company_id:
 *           type: string
 *           format: uuid
 *           nullable: true
 *         customer_name_snapshot:
 *           type: string
 *           nullable: true
 *         insurance_company_name_snapshot:
 *           type: string
 *           nullable: true
 *         product_name_snapshot:
 *           type: string
 *           nullable: true
 *         created_at:
 *           type: string
 *           format: date-time
 *
 *     CommissionItem:
 *       type: object
 *       required: [component_type, commission_amount]
 *       properties:
 *         component_type:
 *           type: string
 *           enum: [OD, TP, ADDON, RSA, ZERO_DEP, PREMIUM, TOPUP, YEAR_1, RENEWAL, OTHER]
 *         base_amount:
 *           type: number
 *           format: double
 *           nullable: true
 *         percentage:
 *           type: number
 *           format: double
 *           nullable: true
 *         commission_amount:
 *           type: number
 *           format: double
 *
 *     Commission:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         sub_broker_id:
 *           type: string
 *           format: uuid
 *         policy_id:
 *           type: string
 *           format: uuid
 *           nullable: true
 *         policy_number:
 *           type: string
 *           nullable: true
 *         customer:
 *           type: object
 *           nullable: true
 *           properties:
 *             id: { type: string, format: uuid }
 *             customer_name: { type: string }
 *         lob:
 *           type: object
 *           nullable: true
 *           properties:
 *             id: { type: string, format: uuid }
 *             name: { type: string }
 *         product:
 *           type: object
 *           nullable: true
 *           properties:
 *             id: { type: string, format: uuid }
 *             name: { type: string }
 *         sub_product:
 *           type: object
 *           nullable: true
 *           properties:
 *             id: { type: string, format: uuid }
 *             name: { type: string }
 *         insurance_company:
 *           type: object
 *           nullable: true
 *           properties:
 *             id: { type: string, format: uuid }
 *             name: { type: string }
 *         commission_basis:
 *           type: string
 *           enum: [PREMIUM_PERCENTAGE, COMMISSION_PERCENTAGE, FIXED_AMOUNT]
 *           nullable: true
 *         total_commission_amount:
 *           type: number
 *           format: double
 *         is_wallet_credited:
 *           type: boolean
 *         wallet_transaction_id:
 *           type: string
 *           format: uuid
 *           nullable: true
 *         status:
 *           type: string
 *           enum: [PENDING, PAID, CANCELLED]
 *         notes:
 *           type: string
 *           nullable: true
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/CommissionItem'
 *         created_at:
 *           type: string
 *           format: date-time
 *
 *     CreateCommissionRequest:
 *       type: object
 *       required: [total_commission_amount]
 *       properties:
 *         policy_number:
 *           type: string
 *         lob_id:
 *           type: string
 *           format: uuid
 *         product_id:
 *           type: string
 *           format: uuid
 *         sub_product_id:
 *           type: string
 *           format: uuid
 *         insurance_company_id:
 *           type: string
 *           format: uuid
 *         commission_basis:
 *           type: string
 *           enum: [PREMIUM_PERCENTAGE, COMMISSION_PERCENTAGE, FIXED_AMOUNT]
 *         total_commission_amount:
 *           type: number
 *           format: double
 *           minimum: 0.01
 *         notes:
 *           type: string
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/CommissionItem'
 */

// ─── Analytics (before :id to avoid param collision) ─────────────────────────

/**
 * @swagger
 * /sub-brokers/analytics:
 *   get:
 *     summary: Get sub-broker analytics overview
 *     description: Returns totals for active brokers, wallet balance, commissions, and breakdowns by LOB and insurance company.
 *     tags: [SubBrokers]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Analytics summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     total_brokers: { type: integer }
 *                     active_brokers: { type: integer }
 *                     total_wallet_balance: { type: number }
 *                     total_commissions: { type: integer }
 *                     pending_commissions: { type: integer }
 *                     commission_by_lob:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           lob_id: { type: string, format: uuid }
 *                           lob_name: { type: string }
 *                           total: { type: number }
 *                           count: { type: integer }
 *                     commission_by_insurance_company:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           insurance_company_id: { type: string, format: uuid }
 *                           insurance_company_name: { type: string }
 *                           total: { type: number }
 *                           count: { type: integer }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/analytics', controller.getAnalytics);

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /sub-brokers:
 *   post:
 *     summary: Create a new sub-broker
 *     tags: [SubBrokers]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateSubBrokerRequest'
 *     responses:
 *       201:
 *         description: Sub-broker created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   $ref: '#/components/schemas/SubBroker'
 *       409:
 *         description: Email already in use
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/', validate(createSubBrokerSchema), controller.createSubBroker);

/**
 * @swagger
 * /sub-brokers:
 *   get:
 *     summary: List all sub-brokers
 *     tags: [SubBrokers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by name, email, or phone
 *       - in: query
 *         name: is_active
 *         schema: { type: boolean }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of sub-brokers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     sub_brokers:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/SubBroker' }
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total: { type: integer }
 *                         page: { type: integer }
 *                         limit: { type: integer }
 *                         total_pages: { type: integer }
 */
router.get('/', controller.getSubBrokers);

/**
 * @swagger
 * /sub-brokers/{id}:
 *   get:
 *     summary: Get a single sub-broker by ID
 *     tags: [SubBrokers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Sub-broker details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/SubBroker' }
 *       404:
 *         description: Sub-broker not found
 */
router.get('/:id', controller.getSubBroker);

/**
 * @swagger
 * /sub-brokers/{id}:
 *   put:
 *     summary: Update a sub-broker
 *     tags: [SubBrokers]
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
 *             $ref: '#/components/schemas/CreateSubBrokerRequest'
 *     responses:
 *       200:
 *         description: Sub-broker updated
 *       404:
 *         description: Sub-broker not found
 */
router.put('/:id', validate(updateSubBrokerSchema), controller.updateSubBroker);

/**
 * @swagger
 * /sub-brokers/{id}:
 *   delete:
 *     summary: Delete a sub-broker
 *     tags: [SubBrokers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Sub-broker deleted
 *       404:
 *         description: Sub-broker not found
 */
router.delete('/:id', controller.deleteSubBroker);

// ─── Wallet ───────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /sub-brokers/{id}/wallet/adjust:
 *   post:
 *     summary: Manually credit or debit a sub-broker's wallet
 *     tags: [SubBrokers]
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
 *             $ref: '#/components/schemas/WalletAdjustmentRequest'
 *     responses:
 *       200:
 *         description: Wallet adjusted — returns new balance
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     wallet_balance: { type: number }
 *                     transaction: { $ref: '#/components/schemas/WalletTransaction' }
 *       400:
 *         description: Insufficient balance for debit
 *       404:
 *         description: Sub-broker not found
 */
router.post('/:id/wallet/adjust', validate(walletAdjustmentSchema), controller.adjustWallet);

/**
 * @swagger
 * /sub-brokers/{id}/wallet/history:
 *   get:
 *     summary: Get paginated wallet transaction history
 *     tags: [SubBrokers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [CREDIT, DEBIT] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated wallet transactions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactions:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/WalletTransaction' }
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total: { type: integer }
 *                         page: { type: integer }
 *                         limit: { type: integer }
 *                         total_pages: { type: integer }
 */
router.get('/:id/wallet/history', controller.getWalletHistory);

// ─── Commissions ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /sub-brokers/{id}/commissions:
 *   post:
 *     summary: Create a commission record for a sub-broker
 *     tags: [SubBrokers]
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
 *             $ref: '#/components/schemas/CreateCommissionRequest'
 *     responses:
 *       201:
 *         description: Commission record created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Commission' }
 *       404:
 *         description: Sub-broker not found
 */
router.post('/:id/commissions', validate(createCommissionSchema), controller.createCommission);

/**
 * @swagger
 * /sub-brokers/{id}/commissions:
 *   get:
 *     summary: List commission records for a sub-broker
 *     tags: [SubBrokers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PENDING, PAID, CANCELLED] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated commission records
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     commissions:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Commission' }
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total: { type: integer }
 *                         page: { type: integer }
 *                         limit: { type: integer }
 *                         total_pages: { type: integer }
 */
router.get('/:id/commissions', controller.getCommissions);

/**
 * @swagger
 * /sub-brokers/{id}/commissions/{commissionId}/status:
 *   patch:
 *     summary: Update a commission status (PAID or CANCELLED)
 *     description: |
 *       Marking as PAID atomically credits the sub-broker's wallet and creates a
 *       WalletTransaction with full analytics FK fields and snapshot data.
 *     tags: [SubBrokers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: Sub-broker ID
 *       - in: path
 *         name: commissionId
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: Commission record ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [PAID, CANCELLED]
 *     responses:
 *       200:
 *         description: Commission status updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Commission' }
 *       400:
 *         description: Commission already processed
 *       404:
 *         description: Commission not found
 */
router.patch(
  '/:id/commissions/:commissionId/status',
  validate(updateCommissionStatusSchema),
  controller.updateCommissionStatus
);

module.exports = router;
