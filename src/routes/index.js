const router = require('express').Router();

router.use('/auth', require('../modules/auth/auth.routes'));
router.use('/v1/proxy', require('../modules/proxy/proxy.routes'));
router.use('/navigation', require('../modules/navigation/navigation.routes'));
router.use('/', require('../modules/rbac/rbac.routes'));
router.use('/api-services', require('../modules/apiServices/apiServices.routes'));
router.use('/imagery-layers', require('../modules/imageryLayers/imageryLayers.routes'));
router.use('/v1/proxy/imagery-layers', require('../modules/imageryLayers/imageryTiles.routes'));
router.use('/dashboard', require('../modules/dashboard/dashboard.routes'));
router.use('/statistics', require('../modules/statistics/statistics.routes'));
router.use('/audit-logs', require('../modules/audit/audit.routes'));
router.use('/notifications', require('../modules/notifications/notifications.routes'));
router.use('/notification-hub', require('../modules/notificationHub/notificationHub.routes'));
router.use('/v1/positioning/radio', require('../modules/positioning/positioning.routes'));
router.use('/integrations/apps', require('../modules/integrations/notificationApps.routes'));
router.use('/integrations/notifications', require('../modules/integrations/externalNotifications.routes'));
router.use('/health', require('../modules/health/health.routes'));
module.exports = router;
