const { Op } = require('sequelize');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const { ApiUsageDaily, ApiService, ApiActivityLog, User } = require('../../db/models');

async function resolveServiceId(slug) {
  if (!slug) return null;
  const service = await ApiService.findOne({ where: { slug } });
  return service?.id || null;
}

const getUsageReport = asyncHandler(async (req, res) => {
  const { from, to, serviceSlug } = req.query;
  const serviceId = await resolveServiceId(serviceSlug);

  const where = { date: { [Op.between]: [from, to] } };
  if (serviceId) where.serviceId = serviceId;

  const rows = await ApiUsageDaily.findAll({
    where,
    include: [{ model: ApiService, as: 'service', attributes: ['slug', 'name'] }],
    order: [['date', 'ASC']],
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.totalCalls += Number(r.totalCalls);
      acc.successCalls += Number(r.successCalls);
      acc.errorCalls += Number(r.errorCalls);
      acc.cacheHits += Number(r.cacheHits);
      return acc;
    },
    { totalCalls: 0, successCalls: 0, errorCalls: 0, cacheHits: 0 }
  );

  return ok(res, { rows, totals });
});

const exportUsageCsv = asyncHandler(async (req, res) => {
  const { from, to, serviceSlug } = req.query;
  const serviceId = await resolveServiceId(serviceSlug);

  const where = { date: { [Op.between]: [from, to] } };
  if (serviceId) where.serviceId = serviceId;

  const rows = await ApiUsageDaily.findAll({
    where,
    include: [{ model: ApiService, as: 'service', attributes: ['slug', 'name'] }],
    order: [['date', 'ASC']],
  });

  const header = 'date,service,total_calls,success_calls,error_calls,cache_hits,avg_latency_ms\n';
  const body = rows
    .map((r) => [r.date, r.service.slug, r.totalCalls, r.successCalls, r.errorCalls, r.cacheHits, r.avgLatencyMs.toFixed(1)].join(','))
    .join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="usage-report-${from}-to-${to}.csv"`);
  return res.status(200).send(header + body);
});

const getActivityLogs = asyncHandler(async (req, res) => {
  const { from, to, serviceSlug, userId, status, source, page, pageSize } = req.query;

  const where = {};
  if (from || to) where.createdAt = {};
  if (from) where.createdAt[Op.gte] = new Date(from);
  if (to) where.createdAt[Op.lte] = new Date(to);
  if (serviceSlug) where.serviceSlug = serviceSlug;
  if (userId) where.userId = userId;
  if (status) where.status = status;
  if (source) where.source = source;

  const { rows, count } = await ApiActivityLog.findAndCountAll({
    where,
    include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'], required: false }],
    order: [['createdAt', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  return ok(res, { rows, page, pageSize, total: count, totalPages: Math.ceil(count / pageSize) });
});

module.exports = { getUsageReport, exportUsageCsv, getActivityLogs };
