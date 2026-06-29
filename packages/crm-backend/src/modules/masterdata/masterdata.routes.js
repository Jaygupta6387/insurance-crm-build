const { Router } = require('express');
const controller = require('./masterdata.controller');
const { authenticate, validateSubscription, requireAdmin } = require('../../middleware/auth.middleware');

const router = Router();

// All master-data routes: authenticated + active subscription + Admin only
router.use(authenticate, validateSubscription, requireAdmin);

/**
 * @swagger
 * tags:
 *   name: MasterData
 *   description: Master reference tables — LOBs, Products, Sub-Products, Insurance Companies (Admin only)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Lob:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *         is_active:
 *           type: boolean
 *         created_at:
 *           type: string
 *           format: date-time
 *
 *     Product:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *         is_active:
 *           type: boolean
 *         lob_id:
 *           type: string
 *           format: uuid
 *         lob:
 *           $ref: '#/components/schemas/Lob'
 *         created_by:
 *           type: string
 *           nullable: true
 *           description: ID of user who created this product
 *         updated_by:
 *           type: string
 *           nullable: true
 *           description: ID of user who last updated this product
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *
 *     SubProduct:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *         is_active:
 *           type: boolean
 *         product_id:
 *           type: string
 *           format: uuid
 *         product:
 *           $ref: '#/components/schemas/Product'
 *         created_by:
 *           type: string
 *           nullable: true
 *           description: ID of user who created this sub-product
 *         updated_by:
 *           type: string
 *           nullable: true
 *           description: ID of user who last updated this sub-product
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *
 *     InsuranceCompany:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *         description:
 *           type: string
 *           nullable: true
 *         is_active:
 *           type: boolean
 *         created_by:
 *           type: string
 *           nullable: true
 *           description: ID of user who created this insurance company
 *         updated_by:
 *           type: string
 *           nullable: true
 *           description: ID of user who last updated this insurance company
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *
 *     CreateMasterItemRequest:
 *       type: object
 *       required: [name]
 *       properties:
 *         name:
 *           type: string
 *           minLength: 1
 *         is_active:
 *           type: boolean
 *           default: true
 *
 *     CreateInsuranceCompanyRequest:
 *       allOf:
 *         - $ref: '#/components/schemas/CreateMasterItemRequest'
 *         - type: object
 *           properties:
 *             description:
 *               type: string
 */

// ─── LOBs ─────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /master/lobs:
 *   get:
 *     summary: List all Lines of Business
 *     tags: [MasterData]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: is_active
 *         schema: { type: boolean }
 *         description: Filter by active status
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: LOB list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     lobs:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Lob' }
 */
router.get('/lobs', controller.getLobs);

/**
 * @swagger
 * /master/lobs:
 *   post:
 *     summary: Create a new Line of Business
 *     tags: [MasterData]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateInsuranceCompanyRequest'
 *     responses:
 *       201:
 *         description: LOB created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Lob' }
 */
router.post('/lobs', controller.createLob);

/**
 * @swagger
 * /master/lobs/{id}:
 *   put:
 *     summary: Update a Line of Business
 *     tags: [MasterData]
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
 *             $ref: '#/components/schemas/CreateInsuranceCompanyRequest'
 *     responses:
 *       200:
 *         description: LOB updated
 *       404:
 *         description: LOB not found
 */
router.put('/lobs/:id', controller.updateLob);

// ─── Products ─────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /master/products:
 *   get:
 *     summary: List all Products
 *     tags: [MasterData]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: lob_id
 *         schema: { type: string, format: uuid }
 *         description: Filter by Line of Business
 *       - in: query
 *         name: is_active
 *         schema: { type: boolean }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Product list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     products:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Product' }
 */
router.get('/products', controller.getProducts);

/**
 * @swagger
 * /master/products:
 *   post:
 *     summary: Create a new Product
 *     tags: [MasterData]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/CreateMasterItemRequest'
 *               - type: object
 *                 required: [lob_id]
 *                 properties:
 *                   lob_id:
 *                     type: string
 *                     format: uuid
 *     responses:
 *       201:
 *         description: Product created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Product' }
 */
router.post('/products', controller.createProduct);

/**
 * @swagger
 * /master/products/{id}:
 *   put:
 *     summary: Update a Product
 *     tags: [MasterData]
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
 *             $ref: '#/components/schemas/CreateMasterItemRequest'
 *     responses:
 *       200:
 *         description: Product updated
 *       404:
 *         description: Product not found
 */
router.put('/products/:id', controller.updateProduct);

/**
 * @swagger
 * /master/products/{id}:
 *   delete:
 *     summary: Delete a Product (Admin only)
 *     tags: [MasterData]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Product deleted successfully
 *       404:
 *         description: Product not found
 */
router.delete('/products/:id', controller.deleteProduct);

// ─── Sub-Products ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /master/sub-products:
 *   get:
 *     summary: List all Sub-Products
 *     tags: [MasterData]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: product_id
 *         schema: { type: string, format: uuid }
 *         description: Filter by parent Product
 *       - in: query
 *         name: is_active
 *         schema: { type: boolean }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Sub-product list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     sub_products:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/SubProduct' }
 */
router.get('/sub-products', controller.getSubProducts);

/**
 * @swagger
 * /master/sub-products:
 *   post:
 *     summary: Create a new Sub-Product
 *     tags: [MasterData]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/CreateMasterItemRequest'
 *               - type: object
 *                 required: [product_id]
 *                 properties:
 *                   product_id:
 *                     type: string
 *                     format: uuid
 *     responses:
 *       201:
 *         description: Sub-product created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/SubProduct' }
 */
router.post('/sub-products', controller.createSubProduct);

/**
 * @swagger
 * /master/sub-products/{id}:
 *   put:
 *     summary: Update a Sub-Product
 *     tags: [MasterData]
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
 *             $ref: '#/components/schemas/CreateMasterItemRequest'
 *     responses:
 *       200:
 *         description: Sub-product updated
 *       404:
 *         description: Sub-product not found
 */
router.put('/sub-products/:id', controller.updateSubProduct);

/**
 * @swagger
 * /master/sub-products/{id}:
 *   delete:
 *     summary: Delete a Sub-Product (Admin only)
 *     tags: [MasterData]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Sub-product deleted successfully
 *       404:
 *         description: Sub-product not found
 */
router.delete('/sub-products/:id', controller.deleteSubProduct);

// ─── Insurance Companies ──────────────────────────────────────────────────────

/**
 * @swagger
 * /master/insurance-companies:
 *   get:
 *     summary: List all Insurance Companies
 *     tags: [MasterData]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: is_active
 *         schema: { type: boolean }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Insurance company list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     insurance_companies:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/InsuranceCompany' }
 */
router.get('/insurance-companies', controller.getInsuranceCompanies);

/**
 * @swagger
 * /master/insurance-companies:
 *   post:
 *     summary: Create a new Insurance Company
 *     tags: [MasterData]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateMasterItemRequest'
 *     responses:
 *       201:
 *         description: Insurance company created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/InsuranceCompany' }
 */
router.post('/insurance-companies', controller.createInsuranceCompany);

/**
 * @swagger
 * /master/insurance-companies/{id}:
 *   put:
 *     summary: Update an Insurance Company
 *     tags: [MasterData]
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
 *             $ref: '#/components/schemas/CreateMasterItemRequest'
 *     responses:
 *       200:
 *         description: Insurance company updated
 *       404:
 *         description: Insurance company not found
 */
router.put('/insurance-companies/:id', controller.updateInsuranceCompany);

/**
 * @swagger
 * /master/insurance-companies/{id}:
 *   delete:
 *     summary: Delete an Insurance Company (Admin only)
 *     tags: [MasterData]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Insurance company deleted successfully
 *       404:
 *         description: Insurance company not found
 */
router.delete('/insurance-companies/:id', controller.deleteInsuranceCompany);

// ─── Policy Types ─────────────────────────────────────────────────────────────
router.get('/policy-types', controller.getPolicyTypes);
router.post('/policy-types', controller.createPolicyType);
router.put('/policy-types/:id', controller.updatePolicyType);

// ─── Motor Premium Rates ──────────────────────────────────────────────────────
router.get('/motor-premium-rates', controller.getMotorPremiumRates);
router.post('/motor-premium-rates', controller.createMotorPremiumRate);
router.put('/motor-premium-rates/:id', controller.updateMotorPremiumRate);
router.delete('/motor-premium-rates/:id', controller.deleteMotorPremiumRate);

// ─── GST Rates (motor: OD/TP; other LOBs: single) ─────────────────────────────
router.get('/gst-rates', controller.getGstRates);
router.post('/gst-rates', controller.createGstRate);
router.put('/gst-rates/:id', controller.updateGstRate);
router.delete('/gst-rates/:id', controller.deleteGstRate);

// ─── Health Plans ─────────────────────────────────────────────────────────────
router.get('/health-plans', controller.getHealthPlans);
router.post('/health-plans', controller.createHealthPlan);
router.put('/health-plans/:id', controller.updateHealthPlan);
router.delete('/health-plans/:id', controller.deleteHealthPlan);

module.exports = router;
