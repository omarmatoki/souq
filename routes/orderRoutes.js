const express = require('express');
const router = express.Router();
const orderController = require('../controllers/OrderController');
const authMiddleware = require('../middleware/authMiddleware');

// المسارات العامة
router.get('/pending-settlements', authMiddleware, orderController.getPendingSettlementOrders);

router.post('/', orderController.createOrder);
router.get('/:id', orderController.getOrderById);

// مسارات الفلترة والإحصائيات الجديدة (لا تحتاج مصادقة)
router.get('/store/:store_id/filter', orderController.filterStoreOrders);
router.get('/store/:store_id/order-statistics', orderController.getOrdersStatistics);

// المسار لإحصائيات التصفير (لا يحتاج مصادقة)
router.get('/store/:store_id/settlement-statistics', orderController.getSettlementStatistics);

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

// مسارات التصفير (تحتاج مصادقة)

// جميع المتاجر التي طلبت التصفير (للأدمن)
router.get('/pending-settlements', authMiddleware, orderController.getPendingSettlementOrders);

// طلبات التصفير لمتجر واحد (للتاجر أو الأدمن)
router.get('/store/:store_id/pending-settlement', authMiddleware, orderController.getStorePendingSettlement);

// طلب تصفير الطلبات (للتاجر)
router.post('/store/:store_id/request-settlement', authMiddleware, orderController.requestOrdersSettlement);

// الموافقة على التصفير (للأدمن)
router.post('/store/:store_id/approve-settlement', authMiddleware, orderController.approveOrdersSettlement);

// الحصول على الطلبات حسب حالة التصفير مع pagination
router.get('/store/:store_id/by-settlement-status', authMiddleware, orderController.getOrdersBySettlementStatus);

module.exports = router;