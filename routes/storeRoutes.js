const express = require('express');
const router = express.Router();
const storeController = require('../controllers/StoreController');
const authMiddleware = require('../middleware/authMiddleware');

// المسارات العامة (لا تحتاج مصادقة)
router.get('/', storeController.getAllStores);
router.get('/:id', storeController.getStoreById);

// المسارات التي تحتاج مصادقة
router.post('/', authMiddleware, storeController.createStore);
router.put('/:id', authMiddleware, storeController.updateStore);
router.delete('/:id', authMiddleware, storeController.deleteStore);
router.get('/my/store', authMiddleware, storeController.getMyStore);

module.exports = router;