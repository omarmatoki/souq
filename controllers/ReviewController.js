const db = require('../models');


exports.createReview = async (req, res) => {
  try {
    const { 
      product_id, 
      store_id, 
      reviewer_name, 
      reviewer_phone, 
      rating, 
      comment, 
      review_type,
      session_id
    } = req.body;

    // التحقق من البيانات المطلوبة
    if (!session_id) {
      return res.status(400).json({ error: 'session_id مطلوب' });
    }

    if (!review_type || !['product', 'store'].includes(review_type)) {
      return res.status(400).json({ error: 'نوع التقييم يجب أن يكون product أو store' });
    }

    // التحقق من وجود إما rating أو comment (أو كلاهما)
    const hasRating = rating && rating >= 1 && rating <= 5;
    const hasComment = comment && comment.trim().length > 0;

    if (!hasRating && !hasComment) {
      return res.status(400).json({ error: 'يجب إضافة تقييم أو تعليق على الأقل' });
    }

    // التحقق من صحة التقييم إذا كان موجوداً
    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({ error: 'التقييم يجب أن يكون بين 1 و 5' });
    }

    // التحقق من الاسم فقط إذا كان هناك تعليق جديد
    if (hasComment) {
      if (!reviewer_name || reviewer_name.trim().length === 0) {
        return res.status(400).json({ error: 'اسم المراجع مطلوب عند كتابة تعليق' });
      }
    }

    // التحقق من نوع التقييم وصحة البيانات
    if (review_type === 'product') {
      if (!product_id) {
        return res.status(400).json({ error: 'معرف المنتج مطلوب' });
      }
      
      const product = await db.Product.findByPk(product_id);
      if (!product) {
        return res.status(404).json({ error: 'المنتج غير موجود' });
      }
    }

    if (review_type === 'store') {
      if (!store_id) {
        return res.status(400).json({ error: 'معرف المتجر مطلوب' });
      }
      
      const store = await db.Store.findByPk(store_id);
      if (!store) {
        return res.status(404).json({ error: 'المتجر غير موجود' });
      }
    }

    // إعداد شروط البحث الأساسية
    const baseWhereClause = {
      session_id,
      review_type
    };

    if (review_type === 'product') {
      baseWhereClause.product_id = product_id;
    } else {
      baseWhereClause.store_id = store_id;
    }

    // البحث عن أي سجل موجود لنفس الجلسة والمنتج/المتجر
    const existingRecord = await db.Review.findOne({
      where: baseWhereClause,
      order: [['created_at', 'DESC']]
    });

    let result = null;
    let message = '';

    if (existingRecord) {
      // إذا كان هناك سجل موجود، نحدد نوع العملية المطلوبة
      
      if (hasRating && hasComment) {
        // المستخدم يريد تحديث/إضافة كل من التقييم والتعليق
        await existingRecord.update({
          rating: parseInt(rating),
          comment: comment,
          reviewer_name: reviewer_name,
          reviewer_phone: reviewer_phone || existingRecord.reviewer_phone,
          updated_at: new Date()
        });
        
        result = existingRecord;
        message = 'تم تحديث التقييم والتعليق بنجاح';
        
      } else if (hasRating && !hasComment) {
        // المستخدم يريد تحديث التقييم فقط
        const updateData = {
          rating: parseInt(rating),
          reviewer_phone: reviewer_phone || existingRecord.reviewer_phone,
          updated_at: new Date()
        };
        
        // إذا لم يكن هناك تعليق موجود من قبل، لا نمس بيانات التعليق
        if (!existingRecord.comment) {
          updateData.reviewer_name = null;
        }
        
        await existingRecord.update(updateData);
        result = existingRecord;
        message = 'تم تحديث التقييم بنجاح';
        
      } else if (!hasRating && hasComment) {
        // المستخدم يريد إضافة تعليق فقط
        
        if (existingRecord.comment) {
          // إذا كان هناك تعليق موجود، ننشئ سجل جديد للتعليق الجديد
          const newCommentData = {
            product_id: review_type === 'product' ? product_id : null,
            store_id: review_type === 'store' ? store_id : null,
            session_id,
            review_type,
            reviewer_name: reviewer_name,
            reviewer_phone: reviewer_phone || null,
            rating: null,
            comment: comment,
            is_verified: false
          };
          
          result = await db.Review.create(newCommentData);
          message = 'تم إضافة التعليق الجديد بنجاح';
          
        } else {
          // إذا لم يكن هناك تعليق موجود، نحدث السجل الحالي
          await existingRecord.update({
            comment: comment,
            reviewer_name: reviewer_name,
            reviewer_phone: reviewer_phone || existingRecord.reviewer_phone,
            updated_at: new Date()
          });
          
          result = existingRecord;
          message = 'تم إضافة التعليق بنجاح';
        }
      }
      
    } else {
      // إذا لم يكن هناك سجل موجود، ننشئ سجل جديد
      const newReviewData = {
        product_id: review_type === 'product' ? product_id : null,
        store_id: review_type === 'store' ? store_id : null,
        session_id,
        review_type,
        reviewer_name: hasComment ? reviewer_name : null,
        reviewer_phone: reviewer_phone || null,
        rating: hasRating ? parseInt(rating) : null,
        comment: hasComment ? comment : null,
        is_verified: false
      };
      
      result = await db.Review.create(newReviewData);
      
      if (hasRating && hasComment) {
        message = 'تم إضافة التقييم والتعليق بنجاح';
      } else if (hasRating) {
        message = 'تم إضافة التقييم بنجاح';
      } else {
        message = 'تم إضافة التعليق بنجاح';
      }
    }

    // إعداد الاستجابة
    const response = {
      success: true,
      message: message,
      data: {
        review: result
      }
    };

    res.status(200).json(response);

  } catch (error) {
    console.error('Error creating/updating review:', error);
    
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ 
        success: false,
        error: 'خطأ في التحقق من البيانات',
        details: error.errors.map(err => err.message)
      });
    }
    
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ 
        success: false,
        error: 'البيانات المدخلة مكررة'
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'حدث خطأ في السيرفر' 
    });
  }
};

// الحصول على تقييمات الزائر بناءً على session_id
exports.getCustomerReviews = async (req, res) => {
  try {
    const { session_id } = req.params;

    if (!session_id) {
      return res.status(400).json({ error: 'session_id مطلوب' });
    }

    // الحصول على جميع التقييمات لهذا الزائر
    const reviews = await db.Review.getBySession(session_id);

    res.status(200).json({
      message: 'تم الحصول على التقييمات بنجاح',
      count: reviews.length,
      reviews
    });

  } catch (error) {
    console.error('Error getting customer reviews:', error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على تقييمات منتج معين
exports.getProductReviews = async (req, res) => {
  try {
    const { product_id } = req.params;
    
    console.log('🔍 البحث عن تقييمات للمنتج رقم:', product_id);
    console.log('📋 المودلات المتاحة:', Object.keys(db));

    // التحقق من وجود المنتج أولاً
    const product = await db.Product.findByPk(product_id);
    if (!product) {
      console.log('❌ المنتج غير موجود');
      return res.status(404).json({
        error: 'المنتج غير موجود',
        product_id: parseInt(product_id)
      });
    }

    console.log('✅ تم العثور على المنتج:', product.name);

    // جلب جميع التقييمات أولاً للتشخيص
    const allReviews = await db.Review.findAll();
    console.log('📊 إجمالي التقييمات في قاعدة البيانات:', allReviews.length);
    
    if (allReviews.length > 0) {
      console.log('📋 عينة من التقييمات:', allReviews.slice(0, 3).map(r => ({
        review_id: r.review_id,
        product_id: r.product_id,
        review_type: r.review_type,
        rating: r.rating,
        comment: r.comment ? r.comment.substring(0, 50) + '...' : 'لا يوجد تعليق'
      })));
    }

    // جلب التقييمات للمنتج المحدد بدون شرط review_type أولاً
    const allProductReviews = await db.Review.findAll({
      where: {
        product_id: parseInt(product_id)
      }
    });

    console.log('📊 تقييمات المنتج (بدون فلتر النوع):', allProductReviews.length);

    // الآن مع شرط review_type
    const reviews = await db.Review.findAndCountAll({
      where: {
        product_id: parseInt(product_id),
        review_type: 'product'
      },
      order: [['created_at', 'DESC']],
      raw: false  // للحصول على كامل البيانات
    });

    console.log('📊 تقييمات المنتج (مع فلتر النوع):', reviews.count);
    
    if (reviews.rows.length > 0) {
      console.log('📋 التقييمات الموجودة:', reviews.rows.map(r => ({
        id: r.review_id,
        rating: r.rating,
        reviewer: r.reviewer_name,
        comment: r.comment ? r.comment.substring(0, 30) : 'لا يوجد'
      })));
    }

    // حساب الإحصائيات يدوياً
    const validRatings = reviews.rows.filter(review => 
      review.rating !== null && 
      review.rating !== undefined && 
      review.rating >= 1 && 
      review.rating <= 5
    );
    
    const totalRatings = validRatings.length;
    const averageRating = totalRatings > 0 
      ? validRatings.reduce((sum, review) => sum + review.rating, 0) / totalRatings 
      : 0;

    // حساب توزيع التقييمات
    const ratingStats = {
      "1": 0,
      "2": 0,
      "3": 0,
      "4": 0,
      "5": 0
    };

    validRatings.forEach(review => {
      ratingStats[review.rating.toString()]++;
    });

    console.log('📊 الإحصائيات المحسوبة:', {
      totalRatings,
      averageRating: Math.round(averageRating * 10) / 10,
      ratingStats
    });

    // تنسيق النتيجة النهائية
    const result = {
      success: true,
      message: 'تم الحصول على تقييمات المنتج بنجاح',
      data: {
        product_id: parseInt(product_id),
        product_name: product.name,
        reviews: reviews.rows.map(review => ({
          review_id: review.review_id,
          reviewer_name: review.reviewer_name,
          reviewer_phone: review.reviewer_phone,
          rating: review.rating,
          comment: review.comment,
          is_verified: review.is_verified,
          created_at: review.created_at,
          updated_at: review.updated_at
        })),
        statistics: {
          totalReviews: reviews.count,
          averageRating: Math.round(averageRating * 10) / 10,
          ratingStats
        }
      },
      // معلومات للتشخيص (يمكن حذفها في الإنتاج)
      debug: {
        totalReviewsInDB: allReviews.length,
        productReviewsWithoutFilter: allProductReviews.length,
        productReviewsWithFilter: reviews.count
      }
    };

    console.log('✅ إرسال النتيجة النهائية');
    res.status(200).json(result);

  } catch (error) {
    console.error('❌ خطأ في جلب التقييمات:', error);
    console.error('تفاصيل الخطأ:', {
      message: error.message,
      stack: error.stack
    });
    
    res.status(500).json({ 
      success: false,
      error: 'حدث خطأ في السيرفر',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// الحصول على تقييمات متجر معين
exports.getStoreReviews = async (req, res) => {
  try {
    const { store_id } = req.params;
    const { verified_only = false, limit = 10, offset = 0 } = req.query;

    const whereCondition = {
      store_id: parseInt(store_id),
      review_type: 'store'
    };

    if (verified_only === 'true') {
      whereCondition.is_verified = true;
    }

    const reviews = await db.Review.findAndCountAll({
      where: whereCondition,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']]
    });

    // الحصول على إحصائيات التقييمات
    const store = await db.Store.findByPk(store_id);
    const stats = store ? await store.getReviewStats() : null;

    res.status(200).json({
      message: 'تم الحصول على تقييمات المتجر بنجاح',
      stats,
      total: reviews.count,
      reviews: reviews.rows
    });

  } catch (error) {
    console.error('Error getting store reviews:', error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// تحديث حالة التحقق من التقييم (للمديرين)
exports.verifyReview = async (req, res) => {
  try {
    const { review_id } = req.params;
    const { is_verified } = req.body;

    const review = await db.Review.findByPk(review_id);
    if (!review) {
      return res.status(404).json({ error: 'التقييم غير موجود' });
    }

    await review.update({ 
      is_verified: Boolean(is_verified),
      updated_at: new Date()
    });

    res.status(200).json({ 
      message: 'تم تحديث حالة التحقق بنجاح', 
      review 
    });

  } catch (error) {
    console.error('Error verifying review:', error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// حذف تقييم (للمديرين أو صاحب التقييم)
exports.deleteReview = async (req, res) => {
  try {
    const { review_id } = req.params;
    const { session_id } = req.body; // للتحقق من ملكية التقييم

    const review = await db.Review.findByPk(review_id);
    if (!review) {
      return res.status(404).json({ error: 'التقييم غير موجود' });
    }

    // التحقق من ملكية التقييم إذا تم تمرير session_id
    if (session_id && review.session_id !== session_id) {
      return res.status(403).json({ error: 'غير مسموح لك بحذف هذا التقييم' });
    }

    await review.destroy();

    res.status(200).json({ message: 'تم حذف التقييم بنجاح' });

  } catch (error) {
    console.error('Error deleting review:', error);
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