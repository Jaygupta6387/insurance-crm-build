const { z } = require('zod');

const createEmployeeSchema = z.object({
  full_name: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional(),
});

const updateEmployeeSchema = z.object({
  full_name: z.string().min(2).optional(),
  phone: z.string().optional(),
  is_active: z.boolean().optional(),
});

module.exports = { createEmployeeSchema, updateEmployeeSchema };
