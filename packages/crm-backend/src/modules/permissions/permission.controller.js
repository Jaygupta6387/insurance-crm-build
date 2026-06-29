const permissionService = require('./permission.service');
const asyncWrapper = require('../../utils/asyncWrapper');
const { sendSuccess } = require('../../utils/responseHelper');

const getPermissions = asyncWrapper(async (req, res) => {
  const targetId = req.params.id || req.user.sub;
  const perms = await permissionService.getPermissions(targetId, req.companySlug, req.user.role);
  sendSuccess(res, { permissions: perms });
});

const updatePermissions = asyncWrapper(async (req, res) => {
  const perms = await permissionService.updatePermissions(
    req.params.id,
    req.body,
    req.user.sub,
    req.companySlug
  );
  sendSuccess(res, { permissions: perms }, 'Permissions updated successfully');
});

module.exports = { getPermissions, updatePermissions };
