const express = require('express');
const router = express.Router();
const shippingController = require('../controllers/ShippingController');
const authMiddleware = require('../middleware/authMiddleware');

// المسارات العامة (بدون مصادقة)
router.get('/track/:tracking_number', shippingController.trackShipment);

// المسارات الأساسية للشحن
router.post('/', shippingController.createShipping); // إنشاء شحنة جديدة مع صور الهوية
router.get('/', authMiddleware, shippingController.getAllShipping); // جلب جميع الشحنات
router.get('/:id', authMiddleware, shippingController.getShippingById); // جلب شحنة محددة
router.put('/:id', authMiddleware, shippingController.updateShipping); // تحديث بيانات الشحن
router.delete('/:id', authMiddleware, shippingController.deleteShipping); // حذف الشحنة

// مسارات إدارة حالة الشحن
router.put('/status/:id', authMiddleware, shippingController.updateShippingStatus); // تحديث حالة الشحن

// مسارات خاصة بصور الهوية
router.put('/:id/identity-images', authMiddleware, shippingController.updateIdentityImages); // إضافة/تحديث صور الهوية
router.delete('/:id/identity-images', authMiddleware, shippingController.deleteIdentityImage); // حذف صورة هوية معينة

// مسارات المتاجر
router.get('/store/:store_id', authMiddleware, shippingController.getStoreShippings); // جلب شحنات متجر معين

// مسارات الزبائن
router.get('/customer/:customer_session_id', shippingController.getCustomerOrders); // جلب طلبات زبون معين

module.exports = router;