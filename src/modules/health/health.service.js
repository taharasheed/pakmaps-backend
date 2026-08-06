const { ApiService, ServiceHealthCheck } = require('../../db/models');
const { getBreakerStatus } = require('../proxy/concurrencyPool');

async function getServiceStatuses() {
  const services = await ApiService.findAll({ order: [['name', 'ASC']] });

  return Promise.all(
    services.map(async (service) => {
      const latestCheck = await ServiceHealthCheck.findOne({
        where: { serviceId: service.id },
        order: [['checkedAt', 'DESC']],
      });
      const breaker = getBreakerStatus(service.slug);

      let status = 'unknown';
      if (breaker.open) status = 'down';
      else if (latestCheck) status = latestCheck.status;

      return {
        id: service.id,
        slug: service.slug,
        name: service.name,
        isEnabled: service.isEnabled,
        status,
        latencyMs: latestCheck?.latencyMs ?? null,
        lastCheckedAt: latestCheck?.checkedAt ?? null,
        activeCalls: breaker.activeCalls,
        circuitBreakerOpen: breaker.open,
      };
    })
  );
}

module.exports = { getServiceStatuses };
