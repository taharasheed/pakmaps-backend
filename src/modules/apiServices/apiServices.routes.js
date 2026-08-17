const router = require('express').Router();
const { authMiddleware } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');
const validate = require('../../middleware/validate');
const { updateServiceSchema, idParam, listServicesSchema } = require('./apiServices.validation');
const controller = require('./apiServices.controller');
const { z } = require('zod');

router.use(authMiddleware);

const idOnly = z.object({ body: z.any().optional(), query: z.any().optional(), params: idParam });

router.get('/', requirePermission('api_services', 'view'), validate(listServicesSchema), controller.listServices);
router.get('/:id', requirePermission('api_services', 'view'), validate(idOnly), controller.getService);
router.post('/', requirePermission('api_services', 'add'), controller.createService);
router.patch('/:id', requirePermission('api_services', 'edit'), validate(updateServiceSchema), controller.updateService);
router.delete('/:id', requirePermission('api_services', 'delete'), validate(idOnly), controller.deleteService);

module.exports = router;
