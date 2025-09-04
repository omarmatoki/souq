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

// المسارات الجديدة المضافة
// جلب جميع الطلبات مع إحصائيات الحالة (مشحونة وغير مشحونة) لمتجر معين
router.get('/store/:store_id/stats', authMiddleware, orderController.getAllOrdersWithStats);

// تحديث حالة الطلب إلى مشحون
router.put('/ship/:id', authMiddleware, orderController.updateOrderToShipped);

// تحديث آخر طلب مشحون وما قبله إلى مبرمج لمتجر معين (الراوت المحدث)
router.put('/store/:store_id/programmatic/update-shipped', authMiddleware, orderController.updateStoreShippedOrdersToProgrammatic);

module.exports = router;