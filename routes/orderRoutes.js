const express = require('express');
const router = express.Router();
const orderController = require('../controllers/OrderController');
const authMiddleware = require('../middleware/authMiddleware');

// المسارات العامة
router.post('/', orderController.createOrder);
router.get('/:id', orderController.getOrderById);

// مسارات الفلترة والإحصائيات الجديدة (لا تحتاج مصادقة)
router.get('/store/:store_id/filter', orderController.filterStoreOrders);
router.get('/store/:store_id/order-statistics', orderController.getOrdersStatistics);

// المسارات التي تحتاج مصادقة
router.get('/', authMiddleware, orderController.getAllOrders);
router.put('/status/:id', authMiddleware, orderController.updateOrderStatus);
router.get('/store/:store_id', authMiddleware, orderController.getStoreOrders);
router.delete('/:id', authMiddleware, orderController.deleteOrder);
router.post('/programmatic', authMiddleware, orderController.createProgrammaticOrder);

// المسارات الجديدة المضافة (تحتاج مصادقة)
router.get('/store/:store_id/stats', authMiddleware, orderController.getAllOrdersWithStats);
router.put('/ship/:id', authMiddleware, orderController.updateOrderToShipped);
router.put('/store/:store_id/programmatic/update-shipped', authMiddleware, orderController.updateStoreShippedOrdersToProgrammatic);

module.exports = router;