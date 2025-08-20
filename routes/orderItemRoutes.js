const express = require('express');
const router = express.Router();
const orderItemController = require('../controllers/OrderItemController');
const authMiddleware = require('../middleware/authMiddleware');

// المسارات العامة
router.get('/', orderItemController.getAllOrderItems);
router.get('/:id', orderItemController.getOrderItemById);
router.get('/order/:order_id/items', orderItemController.getOrderItemsWithTotal);

// المسارات التي تحتاج مصادقة
router.post('/', authMiddleware, orderItemController.addOrderItem);
router.put('/:id', authMiddleware, orderItemController.updateOrderItem);
router.delete('/:id', authMiddleware, orderItemController.deleteOrderItem);
router.post('/copy', authMiddleware, orderItemController.copyOrderItems);
router.get('/admin/stats', authMiddleware, orderItemController.getOrderItemsStats);

module.exports = router;