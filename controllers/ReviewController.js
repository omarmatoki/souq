const db = require('../models');

// إنشاء مراجعة جديدة (للمنتج أو المتجر)
exports.createReview = async (req, res) => {
  try {
    const { product_id, store_id, reviewer_name, reviewer_phone, rating, comment, review_type } = req.body;

    // التحقق من وجود نوع التقييم
    if (!review_type || !['product', 'store'].includes(review_type)) {
      return res.status(400).json({ error: 'يجب تحديد نوع التقييم: product أو store' });
    }

    // التحقق من صحة التقييم
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'التقييم يجب أن يكون بين 1 و 5' });
    }

    // التحقق بناءً على نوع التقييم
    if (review_type === 'product') {
      if (!product_id) {
        return res.status(400).json({ error: 'يجب تحديد معرف المنتج لتقييم المنتج' });
      }

      // التحقق من وجود المنتج
      const product = await db.Product.findByPk(product_id);
      if (!product) {
        return res.status(404).json({ error: 'المنتج غير موجود' });
      }
    } else if (review_type === 'store') {
      if (!store_id) {
        return res.status(400).json({ error: 'يجب تحديد معرف المتجر لتقييم المتجر' });
      }

      // التحقق من وجود المتجر
      const store = await db.Store.findByPk(store_id);
      if (!store) {
        return res.status(404).json({ error: 'المتجر غير موجود' });
      }
    }

    const reviewData = {
      product_id: review_type === 'product' ? parseInt(product_id) : null,
      store_id: review_type === 'store' ? parseInt(store_id) : null,
      review_type,
      reviewer_name,
      reviewer_phone,
      rating: parseInt(rating),
      comment,
      is_verified: false // المراجعة تحتاج موافقة
    };

    const review = await db.Review.create(reviewData);
    res.status(201).json(review);
  } catch (error) {
    console.error(error);
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على جميع المراجعات
exports.getAllReviews = async (req, res) => {
  try {
    const { product_id, store_id, review_type, is_verified } = req.query;
    let whereClause = {};

    if (product_id) {
      whereClause.product_id = product_id;
    }

    if (store_id) {
      whereClause.store_id = store_id;
    }

    if (review_type) {
      whereClause.review_type = review_type;
    }

    if (is_verified !== undefined) {
      whereClause.is_verified = is_verified === 'true';
    }

    const reviews = await db.Review.findAll({
      where: whereClause,
      include: [
        {
          model: db.Product,
          as: 'product',
          attributes: ['product_id', 'name', 'images'],
          required: false,
          include: [
            {
              model: db.Store,
              attributes: ['store_name']
            }
          ]
        },
        {
          model: db.Store,
          as: 'store',
          attributes: ['store_id', 'store_name', 'store_logo'],
          required: false
        }
      ],
      order: [['created_at', 'DESC']]
    });

    // تنسيق صور المنتجات
    const formattedReviews = reviews.map(review => {
      const reviewData = review.toJSON();
      if (reviewData.product && reviewData.product.images) {
        reviewData.product.images = JSON.parse(reviewData.product.images || '[]');
      }
      return reviewData;
    });

    res.status(200).json(formattedReviews);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على مراجعة بواسطة المعرف
exports.getReviewById = async (req, res) => {
  try {
    const review = await db.Review.findByPk(req.params.id, {
      include: [
        {
          model: db.Product,
          as: 'product',
          attributes: ['product_id', 'name', 'images'],
          required: false,
          include: [
            {
              model: db.Store,
              attributes: ['store_name']
            }
          ]
        },
        {
          model: db.Store,
          as: 'store',
          attributes: ['store_id', 'store_name', 'store_logo'],
          required: false
        }
      ]
    });

    if (!review) {
      return res.status(404).json({ error: 'المراجعة غير موجودة' });
    }

    // تنسيق صور المنتج
    const reviewData = review.toJSON();
    if (reviewData.product && reviewData.product.images) {
      reviewData.product.images = JSON.parse(reviewData.product.images || '[]');
    }

    res.status(200).json(reviewData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// تحديث مراجعة
exports.updateReview = async (req, res) => {
  try {
    const review = await db.Review.findByPk(req.params.id);
    if (!review) {
      return res.status(404).json({ error: 'المراجعة غير موجودة' });
    }

    let updatedData = { ...req.body };

    // تحديث وقت التعديل
    updatedData.updated_at = new Date();

    // التحقق من صحة التقييم إذا تم إرساله
    if (updatedData.rating && (updatedData.rating < 1 || updatedData.rating > 5)) {
      return res.status(400).json({ error: 'التقييم يجب أن يكون بين 1 و 5' });
    }

    // منع تغيير نوع التقييم أو المعرفات
    delete updatedData.review_type;
    delete updatedData.product_id;
    delete updatedData.store_id;

    await review.update(updatedData);
    res.status(200).json(review);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// حذف مراجعة
exports.deleteReview = async (req, res) => {
  try {
    const review = await db.Review.findByPk(req.params.id);
    if (!review) {
      return res.status(404).json({ error: 'المراجعة غير موجودة' });
    }

    await review.destroy();
    res.status(200).json({ message: 'تم حذف المراجعة بنجاح' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// التحقق من المراجعة أو إلغاء التحقق
exports.verifyReview = async (req, res) => {
  try {
    const { is_verified } = req.body;
    const review = await db.Review.findByPk(req.params.id);

    if (!review) {
      return res.status(404).json({ error: 'المراجعة غير موجودة' });
    }

    if (typeof is_verified !== 'boolean') {
      return res.status(400).json({ error: 'يجب إرسال قيمة بوليانية صحيحة لـ is_verified' });
    }

    await review.update({ is_verified });
    res.status(200).json({ 
      message: is_verified ? 'تم التحقق من المراجعة بنجاح' : 'تم إلغاء التحقق من المراجعة',
      review 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على مراجعات منتج معين
exports.getProductReviews = async (req, res) => {
  try {
    const { product_id } = req.params;
    const { verified_only = 'true' } = req.query;

    let whereClause = { 
      product_id,
      review_type: 'product'
    };

    if (verified_only === 'true') {
      whereClause.is_verified = true;
    }

    const reviews = await db.Review.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']]
    });

    // حساب متوسط التقييم
    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = reviews.length > 0 ? (totalRating / reviews.length).toFixed(1) : 0;

    // إحصائيات التقييمات
    const ratingStats = {
      1: reviews.filter(r => r.rating === 1).length,
      2: reviews.filter(r => r.rating === 2).length,
      3: reviews.filter(r => r.rating === 3).length,
      4: reviews.filter(r => r.rating === 4).length,
      5: reviews.filter(r => r.rating === 5).length
    };

    res.status(200).json({
      reviews,
      averageRating: parseFloat(averageRating),
      totalReviews: reviews.length,
      ratingStats
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على مراجعات متجر معين
exports.getStoreReviews = async (req, res) => {
  try {
    const { store_id } = req.params;
    const { verified_only = 'true' } = req.query;

    let whereClause = {
      store_id,
      review_type: 'store'
    };

    if (verified_only === 'true') {
      whereClause.is_verified = true;
    }

    const reviews = await db.Review.findAll({
      where: whereClause,
      include: [
        {
          model: db.Store,
          as: 'store',
          attributes: ['store_name', 'store_logo']
        }
      ],
      order: [['created_at', 'DESC']]
    });

    // حساب متوسط التقييم للمتجر
    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = reviews.length > 0 ? (totalRating / reviews.length).toFixed(1) : 0;

    // إحصائيات التقييمات
    const ratingStats = {
      1: reviews.filter(r => r.rating === 1).length,
      2: reviews.filter(r => r.rating === 2).length,
      3: reviews.filter(r => r.rating === 3).length,
      4: reviews.filter(r => r.rating === 4).length,
      5: reviews.filter(r => r.rating === 5).length
    };

    res.status(200).json({
      reviews,
      averageRating: parseFloat(averageRating),
      totalReviews: reviews.length,
      ratingStats
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على جميع مراجعات منتجات متجر معين
exports.getStoreProductReviews = async (req, res) => {
  try {
    const { store_id } = req.params;
    const { verified_only = 'true' } = req.query;

    let includeWhere = {
      review_type: 'product'
    };
    
    if (verified_only === 'true') {
      includeWhere.is_verified = true;
    }

    const reviews = await db.Review.findAll({
      where: includeWhere,
      include: [
        {
          model: db.Product,
          as: 'product',
          where: { store_id },
          attributes: ['product_id', 'name', 'images'],
          include: [
            {
              model: db.Store,
              attributes: ['store_name']
            }
          ]
        }
      ],
      order: [['created_at', 'DESC']]
    });

    // تنسيق صور المنتجات
    const formattedReviews = reviews.map(review => {
      const reviewData = review.toJSON();
      if (reviewData.product && reviewData.product.images) {
        reviewData.product.images = JSON.parse(reviewData.product.images || '[]');
      }
      return reviewData;
    });

    // حساب متوسط التقييم للمتجر بناءً على منتجاته
    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = reviews.length > 0 ? (totalRating / reviews.length).toFixed(1) : 0;

    res.status(200).json({
      reviews: formattedReviews,
      averageRating: parseFloat(averageRating),
      totalReviews: reviews.length
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على إحصائيات تقييمات المتجر (تشمل تقييمات المتجر والمنتجات)
exports.getStoreRatingStats = async (req, res) => {
  try {
    const { store_id } = req.params;

    // التحقق من وجود المتجر
    const store = await db.Store.findByPk(store_id);
    if (!store) {
      return res.status(404).json({ error: 'المتجر غير موجود' });
    }

    // تقييمات المتجر المباشرة
    const storeReviews = await db.Review.findAll({
      where: { 
        store_id,
        review_type: 'store',
        is_verified: true
      }
    });

    // تقييمات منتجات المتجر
    const productReviews = await db.Review.findAll({
      where: {
        review_type: 'product',
        is_verified: true
      },
      include: [
        {
          model: db.Product,
          as: 'product',
          where: { store_id },
          attributes: ['product_id', 'name']
        }
      ]
    });

    // حساب إحصائيات تقييمات المتجر
    const storeRatingTotal = storeReviews.reduce((sum, review) => sum + review.rating, 0);
    const storeAverageRating = storeReviews.length > 0 ? (storeRatingTotal / storeReviews.length) : 0;

    // حساب إحصائيات تقييمات المنتجات
    const productRatingTotal = productReviews.reduce((sum, review) => sum + review.rating, 0);
    const productAverageRating = productReviews.length > 0 ? (productRatingTotal / productReviews.length) : 0;

    // حساب المتوسط العام
    const allReviews = [...storeReviews, ...productReviews];
    const overallRatingTotal = allReviews.reduce((sum, review) => sum + review.rating, 0);
    const overallAverageRating = allReviews.length > 0 ? (overallRatingTotal / allReviews.length) : 0;

    res.status(200).json({
      store: {
        store_id: store.store_id,
        store_name: store.store_name
      },
      storeReviews: {
        count: storeReviews.length,
        averageRating: parseFloat(storeAverageRating.toFixed(1))
      },
      productReviews: {
        count: productReviews.length,
        averageRating: parseFloat(productAverageRating.toFixed(1))
      },
      overall: {
        totalReviews: allReviews.length,
        averageRating: parseFloat(overallAverageRating.toFixed(1))
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على المراجعات غير المحققة (للمسؤولين)
exports.getPendingReviews = async (req, res) => {
  try {
    // التحقق من صلاحية المسؤول
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'غير مصرح لك بعرض المراجعات المعلقة' });
    }

    const reviews = await db.Review.findAll({
      where: { is_verified: false },
      include: [
        {
          model: db.Product,
          as: 'product',
          attributes: ['product_id', 'name', 'images'],
          required: false,
          include: [
            {
              model: db.Store,
              attributes: ['store_name']
            }
          ]
        },
        {
          model: db.Store,
          as: 'store',
          attributes: ['store_id', 'store_name', 'store_logo'],
          required: false
        }
      ],
      order: [['created_at', 'ASC']] // الأقدم أولاً
    });

    // تنسيق صور المنتجات
    const formattedReviews = reviews.map(review => {
      const reviewData = review.toJSON();
      if (reviewData.product && reviewData.product.images) {
        reviewData.product.images = JSON.parse(reviewData.product.images || '[]');
      }
      return reviewData;
    });

    res.status(200).json(formattedReviews);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};