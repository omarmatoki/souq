const express = require('express');
const router = express.Router();
const shippingController = require('../controllers/ShippingController');
const authMiddleware = require('../middleware/authMiddleware');

// المسارات العامة
router.get('/track/:tracking_number',authMiddleware, shippingController.trackShipment);
router.get('/:id',authMiddleware, shippingController.getShippingById);

// المسارات التي تحتاج مصادقة
router.post('/',  shippingController.createShipping);
router.get('/', authMiddleware, shippingController.getAllShipping);
router.put('/:id', authMiddleware, shippingController.updateShipping);
router.put('/status/:id', authMiddleware, shippingController.updateShippingStatus);
router.delete('/:id', authMiddleware, shippingController.deleteShipping);
router.get('/store/:store_id', authMiddleware, shippingController.getStoreShippings);

module.exports = router;