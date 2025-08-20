const express = require('express');
const router = express.Router();
const cartController = require('../controllers/CartController');

// جميع مسارات السلة لا تحتاج مصادقة لأنها تعتمد على session_id
router.post('/get-or-create', cartController.getOrCreateCart);
router.post('/add', cartController.addToCart);
router.put('/item/:id', cartController.updateCartItem);
router.delete('/item/:id', cartController.removeFromCart);
router.post('/clear', cartController.clearCart);
router.get('/total', cartController.getCartTotal);
router.get('/by-store', cartController.getCartByStore);

module.exports = router;