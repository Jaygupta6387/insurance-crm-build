const z = require('zod');

const motorMakeCreateSchema = z.object({
  make_name: z.string().min(2, 'Make name must be at least 2 characters').trim(),
});

const motorMakeUpdateSchema = z.object({
  make_name: z.string().min(2, 'Make name must be at least 2 characters').trim().optional(),
  is_active: z.boolean().optional(),
});

const motorModelCreateSchema = z.object({
  make_id: z.string().uuid('Invalid make ID'),
  model_name: z.string().min(2, 'Model name must be at least 2 characters').trim(),
});

const motorModelUpdateSchema = z.object({
  make_id: z.string().uuid('Invalid make ID').optional(),
  model_name: z.string().min(2, 'Model name must be at least 2 characters').trim().optional(),
  is_active: z.boolean().optional(),
});

const motorVariantCreateSchema = z.object({
  make_id: z.string().uuid('Invalid make ID'),
  model_id: z.string().uuid('Invalid model ID'),
  variant_name: z.string().min(2, 'Variant name must be at least 2 characters').trim(),
});

const motorVariantUpdateSchema = z.object({
  make_id: z.string().uuid('Invalid make ID').optional(),
  model_id: z.string().uuid('Invalid model ID').optional(),
  variant_name: z.string().min(2, 'Variant name must be at least 2 characters').trim().optional(),
  is_active: z.boolean().optional(),
});

const rtoCodeCreateSchema = z.object({
  rto_code: z.string().min(2).max(50).toUpperCase().trim(),
  rto_name: z.string().min(2, 'RTO name must be at least 2 characters').trim(),
  city: z.string().min(2, 'City must be at least 2 characters').trim(),
});

const rtoCodeUpdateSchema = z.object({
  rto_code: z.string().min(2).max(50).toUpperCase().trim().optional(),
  rto_name: z.string().min(2, 'RTO name must be at least 2 characters').trim().optional(),
  city: z.string().min(2, 'City must be at least 2 characters').trim().optional(),
  is_active: z.boolean().optional(),
});

const addOnCoverageCreateSchema = z.object({
  add_on_name: z.string().min(2, 'Coverage name must be at least 2 characters').toUpperCase().trim(),
});

const addOnCoverageUpdateSchema = z.object({
  add_on_name: z.string().min(2, 'Coverage name must be at least 2 characters').toUpperCase().trim().optional(),
  is_active: z.boolean().optional(),
});

module.exports = {
  motorMakeCreateSchema,
  motorMakeUpdateSchema,
  motorModelCreateSchema,
  motorModelUpdateSchema,
  motorVariantCreateSchema,
  motorVariantUpdateSchema,
  rtoCodeCreateSchema,
  rtoCodeUpdateSchema,
  addOnCoverageCreateSchema,
  addOnCoverageUpdateSchema,
};
