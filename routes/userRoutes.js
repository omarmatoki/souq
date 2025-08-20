const express = require('express');
const router = express.Router();
const userController = require('../controllers/UserController');
const authMiddleware = require('../middleware/authMiddleware');

// المسارات العامة (لا تحتاج مصادقة)
router.post('/register', userController.register);
router.post('/login', userController.login);

// المسارات التي تحتاج مصادقة
router.get('/profile', authMiddleware, userController.getProfile);
router.get('/verify-token', authMiddleware, userController.verifyToken);
router.put('/change-password', authMiddleware, userController.changePassword);
router.get('/', authMiddleware, userController.getAllUsers);
router.get('/:id', authMiddleware, userController.getUserById);
router.put('/:id', authMiddleware, userController.updateUser);
router.delete('/:id', authMiddleware, userController.deleteUser);

module.exports = router;