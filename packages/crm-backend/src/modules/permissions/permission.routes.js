const { Router } = require('express');
const controller = require('./permission.controller');
const { authenticate, validateSubscription, requireAdmin } = require('../../middleware/auth.middleware');
const validate = require('../../middleware/validate');
const { updatePermissionSchema } = require('../../validators/permission.validators');

const router = Router();

router.use(authenticate, validateSubscription);

/**
 * @swagger
 * tags:
 *   name: Permissions
 *   description: Employee permission management
 */

/**
 * @swagger
 * /permissions/me:
 *   get:
 *     summary: Get own permissions (executives)
 *     tags: [Permissions]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Permission object for the authenticated user
 */
router.get('/me', controller.getPermissions);

/**
 * @swagger
 * /permissions/{id}:
 *   get:
 *     summary: Get permissions for a specific executive (Admin only)
 *     tags: [Permissions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Permissions for the specified executive
 */
router.get('/:id', requireAdmin, controller.getPermissions);

/**
 * @swagger
 * /permissions/{id}:
 *   put:
 *     summary: Update permissions for an executive (Admin only)
 *     tags: [Permissions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Permissions'
 *     responses:
 *       200:
 *         description: Permissions updated
 */
router.put('/:id', requireAdmin, validate(updatePermissionSchema), controller.updatePermissions);

module.exports = router;
