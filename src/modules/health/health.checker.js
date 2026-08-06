const { upstreamFetch } = require('../proxy/httpClient');
const { getAllServices } = require('../proxy/registry');
const { ServiceHealthCheck } = require('../../db/models');
const { notifyUsersWithPermission } = require('../notifications/notifications.service');
const logger = require('../../config/logger');

async function getPreviousStatus(serviceId) {
  const previous = await ServiceHealthCheck.findOne({ where: { serviceId }, order: [['checkedAt', 'DESC']] });
  return previous?.status || null;
}

async function notifyOnTransition(service, previousStatus, newStatus) {
  if (!previousStatus || previousStatus === newStatus) return;
  const title = newStatus === 'down' ? `${service.name} is down` : `${service.name} is back up`;
  const message =
    newStatus === 'down'
      ? `Health checks are failing for the ${service.name} service.`
      : `The ${service.name} service is responding normally again.`;

  await notifyUsersWithPermission('dashboard', 'view', {
    type: newStatus === 'down' ? 'service_down' : 'service_recovered',
    title,
    message,
    meta: { serviceSlug: service.slug },
  }).catch((err) => logger.error({ err }, 'Failed to send service status notification'));
}

async function checkOneService(service) {
  const previousStatus = await getPreviousStatus(service.id);
  const target = service.healthCheckPath || service.baseUrl;

  if (!target) {
    await notifyOnTransition(service, previousStatus, 'down');
    return ServiceHealthCheck.create({ serviceId: service.id, status: 'down', source: 'active', errorMessage: 'No base URL configured.' });
  }

  const startedAt = Date.now();
  try {
    const res = await upstreamFetch(target, { method: 'GET' }, 5000);
    const latencyMs = Date.now() - startedAt;
    const status = res.ok || res.status === 404 ? 'up' : 'down'; // 404 still proves the host answers
    await notifyOnTransition(service, previousStatus, status);
    return ServiceHealthCheck.create({ serviceId: service.id, status, latencyMs, source: 'active' });
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    await notifyOnTransition(service, previousStatus, 'down');
    return ServiceHealthCheck.create({
      serviceId: service.id,
      status: 'down',
      latencyMs,
      source: 'active',
      errorMessage: err.message?.slice(0, 490),
    });
  }
}

async function runHealthChecks() {
  const services = await getAllServices({ fresh: true });
  const enabled = services.filter((s) => s.isEnabled);

  await Promise.allSettled(enabled.map((s) => checkOneService(s)));
  logger.debug({ count: enabled.length }, 'Ran active health checks');
}

module.exports = { runHealthChecks, checkOneService };
