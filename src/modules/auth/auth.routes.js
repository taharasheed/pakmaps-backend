const router = require('express').Router();
const validate = require('../../middleware/validate');
const { authMiddleware } = require('../../middleware/auth.middleware');
const { loginSchema, signupSchema, changePasswordSchema, refreshSchema, listSessionsSchema } = require('./auth.validation');
const controller = require('./auth.controller');

router.post('/signup', validate(signupSchema), controller.signup);
router.post('/login', validate(loginSchema), controller.login);
// No authMiddleware - the access token is presumably already expired.
router.post('/refresh', validate(refreshSchema), controller.refresh);
router.post('/logout', authMiddleware, controller.logout);
router.get('/me', authMiddleware, controller.me);
router.patch('/password', authMiddleware, validate(changePasswordSchema), controller.changePassword);
router.get('/sessions', authMiddleware, validate(listSessionsSchema), controller.listSessions);
router.delete('/sessions/other', authMiddleware, controller.revokeOtherSessions);
router.delete('/sessions/:id', authMiddleware, controller.revokeSession);

module.exports = router;
