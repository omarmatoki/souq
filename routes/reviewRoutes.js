const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/ReviewController');
const authMiddleware = require('../middleware/authMiddleware');

// المسارات العامة
router.get('/product/:product_id', reviewController.getProductReviews);
router.post('/', reviewController.createReview);
router.get('/', reviewController.getAllReviews);
router.get('/:id', reviewController.getReviewById);

router.get('/store/:store_id', reviewController.getStoreReviews);

// المسارات التي تحتاج مصادقة
router.put('/:id', authMiddleware, reviewController.updateReview);
router.delete('/:id', authMiddleware, reviewController.deleteReview);
router.put('/verify/:id', authMiddleware, reviewController.verifyReview);
router.get('/admin/pending', authMiddleware, reviewController.getPendingReviews);

module.exports = router;