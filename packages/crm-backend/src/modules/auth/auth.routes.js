const { Router } = require('express');
const controller = require('./auth.controller');
const { authenticate, validateSubscription } = require('../../middleware/auth.middleware');
const { authLimiter } = require('../../middleware/rateLimiter');
const validate = require('../../middleware/validate');
const {
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changeFirstPasswordSchema,
} = require('../../validators/auth.validators');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication — login, token refresh, and password management
 */

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login (Admin or Executive)
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful — returns access token and user profile
 *       401:
 *         description: Invalid credentials
 *       403:
 *         description: Account blocked or subscription inactive
 */
router.post('/login', authLimiter, validate(loginSchema), controller.login);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token using httpOnly cookie
 *     tags: [Auth]
 *     security: []
 *     responses:
 *       200:
 *         description: New access token issued
 *       401:
 *         description: Refresh token missing or expired
 */
router.post('/refresh', controller.refresh);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current authenticated user profile
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile with permissions
 *       401:
 *         description: Unauthorised
 */
router.get('/me', authenticate, validateSubscription, controller.getMe);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request a password reset email
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, company_slug]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               company_slug:
 *                 type: string
 *     responses:
 *       200:
 *         description: Reset email sent (always 200 to avoid user enumeration)
 */
router.post(
  '/forgot-password',
  authLimiter,
  validate(forgotPasswordSchema),
  controller.forgotPassword
);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password using token from email
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password, company_slug]
 *             properties:
 *               token:
 *                 type: string
 *               password:
 *                 type: string
 *                 minLength: 8
 *               company_slug:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Invalid or expired token
 */
router.post('/reset-password', validate(resetPasswordSchema), controller.resetPassword);

/**
 * @swagger
 * /auth/change-first-password:
 *   post:
 *     summary: Change password on first login (forced)
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [current_password, new_password]
 *             properties:
 *               current_password:
 *                 type: string
 *               new_password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password changed
 *       400:
 *         description: Current password incorrect or change not required
 */
router.post(
  '/change-first-password',
  authenticate,
  validateSubscription,
  validate(changeFirstPasswordSchema),
  controller.changeFirstPassword
);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout — clears refresh token cookie
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out
 */
router.post('/logout', authenticate, validateSubscription, controller.logout);

module.exports = router;
