const AppError = require('../utils/AppError');

function requirePermission(pageKey, action) {
  return function rbacCheck(req, res, next) {
    const permissions = req.user?.role?.permissions || [];
    const hasAccess = permissions.some((perm) => perm.page?.key === pageKey && perm.action === action);
    if (!hasAccess) {
      return next(new AppError(`You do not have '${action}' access to '${pageKey}'.`, 403));
    }
    next();
  };
}

module.exports = { requirePermission };
