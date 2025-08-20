const express = require('express');
const router = express.Router();
const cartItemController = require('../controllers/CartItemController');

// جميع مسارات عناصر السلة لا تحتاج مصادقة لأنها تعتمد على session_id
router.post('/', cartItemController.addCartItem);
router.get('/', cartItemController.getAllCartItems);
router.get('/:id', cartItemController.getCartItemById);
router.put('/:id', cartItemController.updateCartItem);
router.delete('/:id', cartItemController.deleteCartItem);
router.delete('/cart/:cart_id/clear', cartItemController.clearCartItems);
router.get('/cart/:cart_id/total', cartItemController.getCartItemsTotal);
router.post('/move', cartItemController.moveCartItems);

module.exports = router;