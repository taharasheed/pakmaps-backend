const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/apiResponse');
const AppError = require('../../utils/AppError');
const { ApiService } = require('../../db/models');
const { recordAudit } = require('../audit/audit.service');
const { invalidate } = require('../proxy/registry');
const adapters = require('../proxy/adapters');

const createServiceSchema = z.object({
  slug: z.string().min(2).max(60).regex(/^[a-z0-9_]+$/, 'lowercase letters, numbers and underscores only'),
  name: z.string().min(2).max(150),
  handlerKey: z.enum(Object.keys(adapters)),
  baseUrl: z.string().min(1).max(500),
  cacheable: z.boolean().default(false),
  cacheTtlSeconds: z.number().int().min(0).default(0),
  concurrencyLimit: z.number().int().positive().max(1000).default(50),
});

const listServices = asyncHandler(async (req, res) => {
  const { page, pageSize } = req.query;
  const { rows, count } = await ApiService.findAndCountAll({
    order: [['name', 'ASC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  return ok(res, { rows, page, pageSize, total: count, totalPages: Math.ceil(count / pageSize) });
});

const getService = asyncHandler(async (req, res) => {
  const service = await ApiService.findByPk(req.params.id);
  if (!service) throw new AppError('Service not found.', 404);
  return ok(res, service);
});

const createService = asyncHandler(async (req, res) => {
  const input = createServiceSchema.parse(req.body);

  const existing = await ApiService.findOne({ where: { slug: input.slug } });
  if (existing) throw new AppError('A service with this slug already exists.', 409);

  const service = await ApiService.create(input);
  invalidate();

  await recordAudit({ req, user: req.user, action: 'create', entityType: 'api_service', entityId: service.id, changes: input });
  return created(res, service, 'Service registered.');
});

const updateService = asyncHandler(async (req, res) => {
  const service = await ApiService.findByPk(req.params.id);
  if (!service) throw new AppError('Service not found.', 404);

  await service.update(req.body);
  invalidate();

  await recordAudit({ req, user: req.user, action: 'update', entityType: 'api_service', entityId: service.id, changes: req.body });
  return ok(res, service, 'Service updated.');
});

const deleteService = asyncHandler(async (req, res) => {
  const service = await ApiService.findByPk(req.params.id);
  if (!service) throw new AppError('Service not found.', 404);

  await service.destroy();
  invalidate();

  await recordAudit({ req, user: req.user, action: 'delete', entityType: 'api_service', entityId: req.params.id });
  return ok(res, null, 'Service deleted.');
});

module.exports = { listServices, getService, createService, updateService, deleteService };
