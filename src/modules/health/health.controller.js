const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const { getServiceStatuses } = require('./health.service');

const getServiceStatusesHandler = asyncHandler(async (req, res) => {
  const data = await getServiceStatuses();
  return ok(res, data);
});

module.exports = { getServiceStatuses: getServiceStatusesHandler };
