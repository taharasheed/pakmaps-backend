const router = require('express').Router();
const validate = require('../../middleware/validate');
const { authMiddleware } = require('../../middleware/auth.middleware');
const { loginSchema, changePasswordSchema } = require('./auth.validation');
const controller = require('./auth.controller');

router.post('/login', validate(loginSchema), controller.login);
router.post('/logout', authMiddleware, controller.logout);
router.get('/me', authMiddleware, controller.me);
router.patch('/password', authMiddleware, validate(changePasswordSchema), controller.changePassword);
router.get('/sessions', authMiddleware, controller.listSessions);
router.delete('/sessions/other', authMiddleware, controller.revokeOtherSessions);
router.delete('/sessions/:id', authMiddleware, controller.revokeSession);

module.exports = router;
