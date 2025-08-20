const express = require('express');
const router = express.Router();
const orderController = require('../controllers/OrderController');
const authMiddleware = require('../middleware/authMiddleware');

// المسارات العامة
router.post('/', orderController.createOrder);
router.get('/:id', orderController.getOrderById);

// المسارات التي تحتاج مصادقة
router.get('/', authMiddleware, orderController.getAllOrders);
router.put('/status/:id', authMiddleware, orderController.updateOrderStatus);
router.get('/store/:store_id', authMiddleware, orderController.getStoreOrders);
router.delete('/:id', authMiddleware, orderController.deleteOrder);
router.post('/programmatic', authMiddleware, orderController.createProgrammaticOrder);

module.exports = router;