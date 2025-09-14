const express = require('express');
const router = express.Router();
const productController = require('../controllers/ProductController');
const authMiddleware = require('../middleware/authMiddleware');

// المسارات العامة (لا تحتاج مصادقة)
router.get('/', productController.getAllProducts);
router.get('/:id', productController.getProductById);
router.get('/store/:store_id', productController.getStoreProducts);

// مسارات الفلترة والإحصائيات (لا تحتاج مصادقة - للعرض العام)
router.get('/store/:store_id/filter', productController.filterStoreProducts);
router.get('/store/:store_id/statistics', productController.getStoreStockStatistics);

// المسارات التي تحتاج مصادقة
// إضافة هذا السطر مع بقية المسارات التي تحتاج مصادقة
router.post('/multiple', authMiddleware, productController.createMultipleProducts);
router.post('/', authMiddleware, productController.createProduct);
router.put('/:id', authMiddleware, productController.updateProduct);
router.delete('/:id', authMiddleware, productController.deleteProduct);
router.put('/stock/:id', authMiddleware, productController.updateStock);

module.exports = router;