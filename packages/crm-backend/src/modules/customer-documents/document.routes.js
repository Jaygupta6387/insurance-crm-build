const { Router } = require('express');
const controller = require('./document.controller');
const { authenticate, validateSubscription } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/permission.middleware');
const validate = require('../../middleware/validate');
const { createDocumentSchema } = require('../../validators/document.validators');

const router = Router();
router.use(authenticate, validateSubscription);

/**
 * @swagger
 * tags:
 *   name: CustomerDocuments
 *   description: Customer document management (URL-only, no binary storage)
 */

/**
 * @swagger
 * /customer-documents:
 *   post:
 *     summary: Add a document record (URL + metadata only)
 *     tags: [CustomerDocuments]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateDocumentRequest'
 *     responses:
 *       201:
 *         description: Document record created
 */
router.post('/', requirePermission('can_edit_customer'), validate(createDocumentSchema), controller.addDocument);

/**
 * @swagger
 * /customer-documents/{customerId}:
 *   get:
 *     summary: Get all documents for a customer
 *     tags: [CustomerDocuments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: customerId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Document list
 */
router.get('/:customerId', requirePermission('can_view_customers'), controller.getDocuments);

/**
 * @swagger
 * /customer-documents/{id}:
 *   delete:
 *     summary: Delete a document record
 *     tags: [CustomerDocuments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Deleted
 */
router.delete('/:id', requirePermission('can_edit_customer'), controller.deleteDocument);

module.exports = router;
