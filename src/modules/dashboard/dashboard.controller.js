const { Op } = require('sequelize');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const { User, ApiService, ApiUsageDaily } = require('../../db/models');
const { getServiceStatuses } = require('../health/health.service');

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

const getSummary = asyncHandler(async (req, res) => {
  const today = isoDate(new Date());
  const sevenDaysAgo = isoDate(new Date(Date.now() - 6 * 86400000));

  const [userCount, totalServices, enabledServices, statuses, usageWindow] = await Promise.all([
    User.count({ where: { isActive: true } }),
    ApiService.count(),
    ApiService.count({ where: { isEnabled: true } }),
    getServiceStatuses(),
    ApiUsageDaily.findAll({ where: { date: { [Op.gte]: sevenDaysAgo } } }),
  ]);

  const servicesUp = statuses.filter((s) => s.status === 'up').length;
  const servicesDown = statuses.filter((s) => s.status === 'down').length;

  const callsToday = usageWindow.filter((u) => u.date === today).reduce((sum, u) => sum + Number(u.totalCalls), 0);
  const callsLast7Days = usageWindow.reduce((sum, u) => sum + Number(u.totalCalls), 0);

  const byDay = {};
  usageWindow.forEach((u) => {
    byDay[u.date] = (byDay[u.date] || 0) + Number(u.totalCalls);
  });
  const callVolumeSeries = Object.entries(byDay)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, calls]) => ({ date, calls }));

  const byServiceToday = {};
  usageWindow
    .filter((u) => u.date === today)
    .forEach((u) => {
      byServiceToday[u.serviceId] = (byServiceToday[u.serviceId] || 0) + Number(u.totalCalls);
    });
  const services = await ApiService.findAll({ attributes: ['id', 'slug', 'name'] });
  const callsByService = services.map((s) => ({
    slug: s.slug,
    name: s.name,
    calls: byServiceToday[s.id] || 0,
  }));

  return ok(res, {
    userCount,
    totalServices,
    enabledServices,
    servicesUp,
    servicesDown,
    callsToday,
    callsLast7Days,
    callVolumeSeries,
    callsByService,
    serviceStatuses: statuses,
  });
});

module.exports = { getSummary };
