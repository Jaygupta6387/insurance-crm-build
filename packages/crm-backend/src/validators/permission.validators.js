const { z } = require('zod');

const permissionFields = {
  can_view_customers: z.boolean(),
  can_create_customer: z.boolean(),
  can_edit_customer: z.boolean(),
  can_delete_customer: z.boolean(),
  can_create_policy: z.boolean(),
  can_edit_policy: z.boolean(),
  can_delete_policy: z.boolean(),
  can_manage_policy_commission: z.boolean(),
  can_manage_claims: z.boolean(),
  can_create_employee: z.boolean(),
  can_edit_employee: z.boolean(),
  can_delete_employee: z.boolean(),
  can_view_reports: z.boolean(),
};

const updatePermissionSchema = z.object(permissionFields).partial();

module.exports = { updatePermissionSchema };
