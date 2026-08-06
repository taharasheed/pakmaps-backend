const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const { Page, Permission } = require('../../db/models');

const listPages = asyncHandler(async (req, res) => {
  const pages = await Page.findAll({
    include: [{ model: Permission, as: 'permissions' }],
    order: [['sortOrder', 'ASC']],
  });
  return ok(res, pages);
});

module.exports = { listPages };
