const { z } = require('zod');

const isDesktop = process.env.CRM_MODE === 'desktop';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  company_slug: isDesktop
    ? z.string().optional()
    : z.string().min(1, 'Company slug is required'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
  company_slug: isDesktop
    ? z.string().optional()
    : z.string().min(1, 'Company slug is required'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  company_slug: isDesktop
    ? z.string().optional()
    : z.string().min(1, 'Company slug is required'),
});

const changeFirstPasswordSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
});

module.exports = {
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changeFirstPasswordSchema,
};
