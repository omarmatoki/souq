const db = require('../models');
const multer = require('multer');
const path = require('path');

// إعداد تخزين الملفات باستخدام Multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // حفظ الملفات في مجلد uploads
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname)); // إضافة الطابع الزمني إلى اسم الملف
  }
});

// مرشح الملفات للتحقق من الامتدادات
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/; // السماح بالصور فقط
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    return cb(new Error('❌ فقط الملفات بصيغة JPEG, JPG, PNG, GIF, و WEBP مسموحة!'));
  }
};

// إعداد Multer لتحميل الصور
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // حد أقصى 5MB
}).array('images', 10); // السماح بحد أقصى 10 صور

exports.createMultipleProducts = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    try {
      const { store_id } = req.body;
      let products = req.body.products;

      // فك JSON من form-data
      let parsedProducts;
      try {
        parsedProducts = typeof products === 'string' ? JSON.parse(products) : products;
      } catch (e) {
        return res.status(400).json({
          error: 'تنسيق products غير صالح، يجب أن يكون JSON صحيح'
        });
      }

      if (!parsedProducts || !Array.isArray(parsedProducts) || parsedProducts.length === 0) {
        return res.status(400).json({ error: 'يجب إرسال مصفوفة من المنتجات' });
      }

      if (!store_id) {
        return res.status(400).json({ error: 'معرف المتجر مطلوب' });
      }

      // التحقق من المتجر
      const store = await db.Store.findByPk(store_id);
      if (!store) {
        return res.status(404).json({ error: 'المتجر غير موجود' });
      }

      if (store.user_id !== req.user.user_id) {
        return res.status(403).json({ error: 'غير مصرح لك بإضافة منتجات لهذا المتجر' });
      }

      // التحقق من صحة بيانات المنتجات
      const errors = [];
      parsedProducts.forEach((product, index) => {
        if (!product.name || !product.price) {
          errors.push(`المنتج ${index + 1}: اسم المنتج والسعر مطلوبان`);
        }
        
        if (product.price && (isNaN(product.price) || parseFloat(product.price) <= 0)) {
          errors.push(`المنتج ${index + 1}: السعر يجب أن يكون رقماً موجباً`);
        }
        
        if (product.stock_quantity && (isNaN(product.stock_quantity) || parseInt(product.stock_quantity) < 0)) {
          errors.push(`المنتج ${index + 1}: الكمية يجب أن تكون رقماً غير سالب`);
        }
        
        // التحقق من صحة نسبة الخصم
        if (product.discount_percentage !== undefined && product.discount_percentage !== null) {
          const discountValue = parseFloat(product.discount_percentage);
          if (isNaN(discountValue) || discountValue < 0 || discountValue > 100) {
            errors.push(`المنتج ${index + 1}: نسبة الخصم يجب أن تكون رقماً بين 0 و 100`);
          }
        }
        
        if (!product.imagesCount || isNaN(product.imagesCount)) {
          errors.push(`المنتج ${index + 1}: يجب تحديد عدد الصور (imagesCount)`);
        }
      });

      if (errors.length > 0) {
        return res.status(400).json({ error: 'أخطاء في بيانات المنتجات', details: errors });
      }

      // توزيع الصور حسب imagesCount لكل منتج
      const uploadedFiles = req.files || [];
      let fileIndex = 0;

      const productsData = parsedProducts.map((product) => {
        const productImages = [];

        for (let i = 0; i < product.imagesCount; i++) {
          if (uploadedFiles[fileIndex]) {
            productImages.push(`/uploads/${uploadedFiles[fileIndex].filename}`);
            fileIndex++;
          }
        }

        // تحضير بيانات المنتج مع نسبة الخصم
        const productData = {
          name: product.name,
          description: product.description || null,
          price: parseFloat(product.price),
          stock_quantity: product.stock_quantity ? parseInt(product.stock_quantity) : 0,
          store_id: parseInt(store_id),
          images: JSON.stringify(productImages)
        };

        // إضافة نسبة الخصم إذا كانت موجودة وصالحة
        if (product.discount_percentage !== undefined && product.discount_percentage !== null) {
          const discountValue = parseFloat(product.discount_percentage);
          if (!isNaN(discountValue) && discountValue >= 0 && discountValue <= 100) {
            productData.discount_percentage = discountValue;
          }
        }

        return productData;
      });

      const createdProducts = await db.Product.bulkCreate(productsData, {
        returning: true,
        validate: true
      });

      // إضافة معلومات الخصم للاستجابة
      const productsWithDiscountInfo = createdProducts.map(product => {
        const productJson = product.toJSON();
        return productJson;
      });

      res.status(201).json({
        message: `تم إنشاء ${createdProducts.length} منتج بنجاح`,
        products: productsWithDiscountInfo
      });

    } catch (error) {
      console.error('Error creating multiple products:', error);
      res.status(500).json({ error: 'حدث خطأ في السيرفر' });
    }
  });
};



// الحصول على جميع المنتجات
// إنشاء منتج جديد
exports.createProduct = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    try {
      const { name, description, price, discount_percentage, stock_quantity, store_id } = req.body;

      // التحقق من وجود المتجر
      const store = await db.Store.findByPk(store_id);
      if (!store) {
        return res.status(404).json({ error: 'المتجر غير موجود' });
      }

      // التحقق من ملكية المتجر
      if (store.user_id !== req.user.user_id) {
        return res.status(403).json({ error: 'غير مصرح لك بإضافة منتجات لهذا المتجر' });
      }

      const images = req.files?.map(file => `/uploads/${file.filename}`) || [];

      const productData = {
        name,
        description,
        price: parseFloat(price),
        discount_percentage: discount_percentage ? parseFloat(discount_percentage) : null,
        stock_quantity: parseInt(stock_quantity),
        store_id: parseInt(store_id),
        images: JSON.stringify(images)
      };

      const product = await db.Product.create(productData);
      res.status(201).json(product);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'حدث خطأ في السيرفر' });
    }
  });
};

// الحصول على جميع المنتجات
exports.getAllProducts = async (req, res) => {
  try {
    const { store_id, search, min_price, max_price } = req.query;
    let whereClause = {};

    if (store_id) {
      whereClause.store_id = store_id;
    }

    if (search) {
      whereClause.name = { [db.Sequelize.Op.like]: `%${search}%` };
    }

    if (min_price || max_price) {
      whereClause.price = {};
      if (min_price) whereClause.price[db.Sequelize.Op.gte] = parseFloat(min_price);
      if (max_price) whereClause.price[db.Sequelize.Op.lte] = parseFloat(max_price);
    }

    const products = await db.Product.findAll({
      where: whereClause,
      include: [
        {
          model: db.Store,
          as: 'Store',
          attributes: ['store_name', 'logo_image']
        }
      ]
    });

    const formattedProducts = products.map(product => {
      const images = JSON.parse(product.images || '[]');
      const productData = product.toJSON();
      
      // حساب معلومات الخصم
      const originalPrice = parseFloat(productData.price);
      let discountedPrice = originalPrice;
      let discountAmount = 0;
      let hasDiscount = false;
      
      if (productData.discount_percentage && productData.discount_percentage > 0) {
        const discountPercent = parseFloat(productData.discount_percentage);
        discountAmount = (originalPrice * discountPercent) / 100;
        discountedPrice = originalPrice - discountAmount;
        hasDiscount = true;
      }
      
      return {
        ...productData,
        images,
        original_price: originalPrice,
        discounted_price: parseFloat(discountedPrice.toFixed(2)),
        discount_amount: parseFloat(discountAmount.toFixed(2)),
        has_discount: hasDiscount
      };
    });

    res.status(200).json(formattedProducts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على منتج بواسطة المعرف - مُصحح
exports.getProductById = async (req, res) => {
  try {
    const product = await db.Product.findByPk(req.params.id, {
      include: [
        {
          model: db.Store,
          as: 'Store',
          attributes: ['store_id', 'store_name', 'logo_image', 'description']
        },
        {
          model: db.Review,
          as: 'reviews',
          where: { 
            review_type: 'product' // تأكد من جلب تقييمات المنتج فقط
          },
          required: false,
          attributes: [
            'review_id', 
            'reviewer_name', 
            'rating', 
            'comment', 
            'is_verified', 
            'created_at'
          ],
          order: [['created_at', 'DESC']] // الأحدث أولاً
        }
      ]
    });

    if (!product) {
      return res.status(404).json({ error: 'المنتج غير موجود' });
    }

    const productData = product.toJSON();
    productData.images = JSON.parse(productData.images || '[]');
    
    // حساب معلومات الخصم
    const originalPrice = parseFloat(productData.price);
    let discountedPrice = originalPrice;
    let discountAmount = 0;
    let hasDiscount = false;
    
    if (productData.discount_percentage && productData.discount_percentage > 0) {
      const discountPercent = parseFloat(productData.discount_percentage);
      discountAmount = (originalPrice * discountPercent) / 100;
      discountedPrice = originalPrice - discountAmount;
      hasDiscount = true;
    }
    
    // إضافة معلومات الخصم للاستجابة
    productData.original_price = originalPrice;
    productData.discounted_price = parseFloat(discountedPrice.toFixed(2));
    productData.discount_amount = parseFloat(discountAmount.toFixed(2));
    productData.has_discount = hasDiscount;

    // معالجة وتحليل التقييمات
    const reviews = productData.reviews || [];
    
    // فصل التقييمات المحققة عن غير المحققة
    const verifiedReviews = reviews.filter(review => review.is_verified);
    const pendingReviews = reviews.filter(review => !review.is_verified);
    
    // حساب متوسط التقييم (للمحققة فقط)
    const totalVerifiedRating = verifiedReviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = verifiedReviews.length > 0 
      ? parseFloat((totalVerifiedRating / verifiedReviews.length).toFixed(1))
      : 0;

    // حساب متوسط التقييم لجميع التقييمات
    const totalAllRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const overallAverageRating = reviews.length > 0 
      ? parseFloat((totalAllRating / reviews.length).toFixed(1))
      : 0;

    // إحصائيات التقييمات (1-5 نجوم)
    const ratingStats = {
      1: verifiedReviews.filter(r => r.rating === 1).length,
      2: verifiedReviews.filter(r => r.rating === 2).length,
      3: verifiedReviews.filter(r => r.rating === 3).length,
      4: verifiedReviews.filter(r => r.rating === 4).length,
      5: verifiedReviews.filter(r => r.rating === 5).length
    };

    // تنسيق التقييمات للعرض
    const formattedReviews = reviews.map(review => ({
      review_id: review.review_id,
      reviewer_name: review.reviewer_name,
      rating: review.rating,
      comment: review.comment,
      is_verified: review.is_verified,
      created_at: review.created_at,
      // إضافة تاريخ نسبي
      time_ago: getTimeAgo(review.created_at)
    }));

    // ترتيب التقييمات: المحققة أولاً، ثم حسب التاريخ
    const sortedReviews = formattedReviews.sort((a, b) => {
      if (a.is_verified && !b.is_verified) return -1;
      if (!a.is_verified && b.is_verified) return 1;
      return new Date(b.created_at) - new Date(a.created_at);
    });

    // إضافة معلومات التقييمات الشاملة
    productData.reviewsData = {
      // إحصائيات عامة
      total: reviews.length,
      verified: verifiedReviews.length,
      pending: pendingReviews.length,
      
      // متوسطات التقييم
      averageRating: averageRating, // للمحققة فقط
      overallAverageRating: overallAverageRating, // لجميع التقييمات
      
      // إحصائيات النجوم
      ratingDistribution: ratingStats,
      
      // التقييمات مرتبة
      reviews: sortedReviews,
      
      // أحدث التقييمات المحققة (أول 3)
      latestVerified: verifiedReviews
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 3)
        .map(review => ({
          reviewer_name: review.reviewer_name,
          rating: review.rating,
          comment: review.comment?.length > 100 
            ? review.comment.substring(0, 100) + '...' 
            : review.comment,
          created_at: review.created_at
        })),
      
      // إحصائيات أداء التقييم
      performance: {
        excellentReviews: verifiedReviews.filter(r => r.rating >= 4).length,
        poorReviews: verifiedReviews.filter(r => r.rating <= 2).length,
        averageReviews: verifiedReviews.filter(r => r.rating === 3).length,
        recommendationRate: verifiedReviews.length > 0 
          ? parseFloat(((verifiedReviews.filter(r => r.rating >= 4).length / verifiedReviews.length) * 100).toFixed(1))
          : 0
      }
    };

    // إزالة التقييمات الأصلية لتجنب التكرار
    delete productData.reviews;

    res.status(200).json({
      success: true,
      product: productData
    });

  } catch (error) {
    console.error('Error in getProductById:', error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// دالة مساعدة لحساب الوقت النسبي
function getTimeAgo(date) {
  const now = new Date();
  const reviewDate = new Date(date);
  const diffInMs = now - reviewDate;
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
  const diffInWeeks = Math.floor(diffInMs / (1000 * 60 * 60 * 24 * 7));
  const diffInMonths = Math.floor(diffInMs / (1000 * 60 * 60 * 24 * 30));

  if (diffInMinutes < 1) return 'منذ لحظات';
  if (diffInMinutes < 60) return `منذ ${diffInMinutes} دقيقة`;
  if (diffInHours < 24) return `منذ ${diffInHours} ساعة`;
  if (diffInDays < 7) return `منذ ${diffInDays} يوم`;
  if (diffInWeeks < 4) return `منذ ${diffInWeeks} أسبوع`;
  if (diffInMonths < 12) return `منذ ${diffInMonths} شهر`;
  
  const diffInYears = Math.floor(diffInMonths / 12);
  return `منذ ${diffInYears} سنة`;
}
// تعديل منتج
exports.updateProduct = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    try {
      const product = await db.Product.findByPk(req.params.id, {
        include: [{ model: db.Store, as: 'Store' }]
      });

      if (!product) {
        return res.status(404).json({ error: 'المنتج غير موجود' });
      }

      // التحقق من ملكية المتجر
      if (product.Store.user_id !== req.user.user_id) {
        return res.status(403).json({ error: 'غير مصرح لك بتعديل هذا المنتج' });
      }

      let updatedData = { ...req.body };

      // إذا تم رفع صور جديدة
      if (req.files && req.files.length > 0) {
        const images = req.files.map(file => `/uploads/${file.filename}`);
        updatedData.images = JSON.stringify(images);
      }

      // تحويل القيم الرقمية
      if (updatedData.price) {
        updatedData.price = parseFloat(updatedData.price);
      }
      
      if (updatedData.stock_quantity) {
        updatedData.stock_quantity = parseInt(updatedData.stock_quantity);
      }

      // التعامل مع نسبة الخصم
      if (updatedData.discount_percentage !== undefined) {
        // إذا تم إرسال قيمة فارغة أو null، قم بحذف الخصم
        if (updatedData.discount_percentage === '' || 
            updatedData.discount_percentage === null || 
            updatedData.discount_percentage === 'null') {
          updatedData.discount_percentage = null;
        } else {
          // التحقق من صحة نسبة الخصم
          const discountValue = parseFloat(updatedData.discount_percentage);
          
          if (isNaN(discountValue)) {
            return res.status(400).json({ 
              error: 'نسبة الخصم يجب أن تكون رقم صحيح' 
            });
          }
          
          if (discountValue < 0 || discountValue > 100) {
            return res.status(400).json({ 
              error: 'نسبة الخصم يجب أن تكون بين 0 و 100' 
            });
          }
          
          updatedData.discount_percentage = discountValue;
        }
      }

      // تحديث المنتج
      await product.update(updatedData);

      // إنشاء الاستجابة مع معلومات الخصم
      const updatedProduct = await db.Product.findByPk(req.params.id, {
        include: [{ model: db.Store, as: 'Store', attributes: ['store_name'] }]
      });

      const productData = updatedProduct.toJSON();
      
      // حساب معلومات الخصم
      const originalPrice = parseFloat(productData.price);
      let discountedPrice = originalPrice;
      let discountAmount = 0;
      let hasDiscount = false;
      
      if (productData.discount_percentage && productData.discount_percentage > 0) {
        const discountPercent = parseFloat(productData.discount_percentage);
        discountAmount = (originalPrice * discountPercent) / 100;
        discountedPrice = originalPrice - discountAmount;
        hasDiscount = true;
      }

      // تنسيق الاستجابة النهائية
      const response = {
        ...productData,
        images: JSON.parse(productData.images || '[]'),
        original_price: originalPrice,
        discounted_price: parseFloat(discountedPrice.toFixed(2)),
        discount_amount: parseFloat(discountAmount.toFixed(2)),
        has_discount: hasDiscount
      };

      res.status(200).json({
        success: true,
        message: 'تم تحديث المنتج بنجاح',
        product: response
      });

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'حدث خطأ في السيرفر' });
    }
  });
};

// حذف منتج
exports.deleteProduct = async (req, res) => {
  try {
    const product = await db.Product.findByPk(req.params.id, {
      include: [{ model: db.Store, as: 'Store' }]
    });

    if (!product) {
      return res.status(404).json({ error: 'المنتج غير موجود' });
    }

    // التحقق من ملكية المتجر
    if (product.Store.user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'غير مصرح لك بحذف هذا المنتج' });
    }

    await product.destroy();
    res.status(200).json({ message: 'تم حذف المنتج بنجاح' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// تحديث كمية المخزون
exports.updateStock = async (req, res) => {
  try {
    const { stock_quantity } = req.body;
    const product = await db.Product.findByPk(req.params.id, {
      include: [{ model: db.Store, as: 'Store' }]
    });

    if (!product) {
      return res.status(404).json({ error: 'المنتج غير موجود' });
    }

    // التحقق من ملكية المتجر
    if (product.Store.user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'غير مصرح لك بتعديل هذا المنتج' });
    }

    if (typeof stock_quantity !== 'number' || stock_quantity < 0) {
      return res.status(400).json({ error: 'يجب إرسال كمية صحيحة للمخزون' });
    }

    await product.update({ stock_quantity });
    res.status(200).json({ message: 'تم تحديث المخزون بنجاح', stock_quantity: product.stock_quantity });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على منتجات متجر معين
exports.getStoreProducts = async (req, res) => {
  try {
    const { store_id } = req.params;
    const products = await db.Product.findAll({
      where: { store_id },
      include: [
        {
          model: db.Store,
          as: 'Store',
          attributes: ['store_name', 'logo_image']
        }
      ]
    });

    const formattedProducts = products.map(product => {
      const images = JSON.parse(product.images || '[]');
      return {
        ...product.toJSON(),
        images
      };
    });

    res.status(200).json(formattedProducts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

exports.filterStoreProducts = async (req, res) => {
  try {
    const { store_id } = req.params;
    const { 
      name,           // اسم المنتج للبحث
      stockStatus,    // حالة المخزون: 'available', 'low_stock', 'out_of_stock'
      page = 1,       // رقم الصفحة (اختياري)
      limit = 20      // عدد المنتجات في الصفحة (اختياري)
    } = req.query;

    // جلب بيانات المتجر مع صاحب المتجر
    const store = await db.Store.findByPk(store_id, {
      include: [
        {
          model: db.User,
          attributes: ['username', 'whatsapp_number']
        }
      ]
    });

    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'المتجر غير موجود'
      });
    }

    // بناء شروط البحث للمنتجات
    const whereConditions = { store_id };

    // فلترة بالاسم إذا تم تمريره
    if (name && name.trim()) {
      whereConditions.name = {
        [db.Sequelize.Op.like]: `%${name.trim()}%`
      };
    }

    // فلترة حسب حالة المخزون
    if (stockStatus) {
      switch (stockStatus.toLowerCase()) {
        case 'available':
          // منتجات متوفرة (أكثر من 5 قطع)
          whereConditions.stock_quantity = {
            [db.Sequelize.Op.gt]: 5
          };
          break;
        case 'low_stock':
          // مخزون قليل (من 1 إلى 5 قطع)
          whereConditions.stock_quantity = {
            [db.Sequelize.Op.between]: [1, 5]
          };
          break;
        case 'out_of_stock':
          // منتهي الكمية (0 قطع)
          whereConditions.stock_quantity = 0;
          break;
        default:
          // إذا تم تمرير قيمة غير صحيحة، لا نطبق فلتر المخزون
          break;
      }
    }

    // حساب offset للتصفح
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // جلب المنتجات مع الفلترة والتصفح
    const { count, rows: products } = await db.Product.findAndCountAll({
      where: whereConditions,
      include: [
        {
          model: db.Review,
          as: 'reviews', // استخدام الـ alias الصحيح من ملف الربط
          where: {
            review_type: 'product', // جلب تقييمات المنتجات فقط
            is_verified: true // جلب التقييمات المُتحقق منها فقط
          },
          attributes: ['rating', 'comment', 'reviewer_name', 'created_at'],
          required: false // LEFT JOIN للحصول على المنتجات حتى لو لم تكن لها تقييمات
        }
      ],
      limit: parseInt(limit),
      offset: offset,
      order: [['created_at', 'DESC']] // ترتيب بالأحدث أولاً
    });

    // تنسيق بيانات المنتجات
    const formattedProducts = products.map(product => {
      const productData = product.toJSON();
      
      // حساب متوسط التقييم
      if (productData.reviews && productData.reviews.length > 0) {
        const totalRating = productData.reviews.reduce((sum, review) => sum + review.rating, 0);
        productData.averageRating = parseFloat((totalRating / productData.reviews.length).toFixed(1));
        productData.reviewsCount = productData.reviews.length;
      } else {
        productData.averageRating = 0;
        productData.reviewsCount = 0;
      }
      
      // تحديد حالة المخزون باللغة العربية
      if (productData.stock_quantity === 0) {
        productData.stockStatus = 'نفذ المخزون';
      } else if (productData.stock_quantity <= 5) {
        productData.stockStatus = 'مخزون منخفض';
      } else {
        productData.stockStatus = 'متوفر';
      }
      
      // إزالة بيانات التقييمات الخام من الاستجابة (اختياري)
      delete productData.reviews;
      
      return productData;
    });

    // حساب إحصائيات المخزون للمنتجات المفلترة
    const stockStats = await db.Product.findAll({
      where: whereConditions,
      attributes: [
        [db.sequelize.fn('COUNT', db.sequelize.col('product_id')), 'total'],
        [db.sequelize.fn('SUM', 
          db.sequelize.literal('CASE WHEN stock_quantity > 5 THEN 1 ELSE 0 END')
        ), 'available'],
        [db.sequelize.fn('SUM', 
          db.sequelize.literal('CASE WHEN stock_quantity BETWEEN 1 AND 5 THEN 1 ELSE 0 END')
        ), 'low_stock'],
        [db.sequelize.fn('SUM', 
          db.sequelize.literal('CASE WHEN stock_quantity = 0 THEN 1 ELSE 0 END')
        ), 'out_of_stock']
      ],
      raw: true
    });

    // حساب إحصائيات التقييمات للمنتجات المفلترة
    const reviewStats = await db.Review.findAll({
      include: [
        {
          model: db.Product,
          as: 'product', // استخدام الـ alias الصحيح من ملف الربط
          where: whereConditions,
          attributes: []
        }
      ],
      where: {
        review_type: 'product', // تقييمات المنتجات فقط
        is_verified: true // التقييمات المُتحقق منها فقط
      },
      attributes: [
        [db.sequelize.fn('AVG', db.sequelize.col('rating')), 'averageRating'],
        [db.sequelize.fn('COUNT', db.sequelize.col('Review.review_id')), 'totalReviews']
      ],
      raw: true
    });

    // جلب تقييمات المتجر (إضافة جديدة)
    const storeReviewStats = await db.Review.findAll({
      where: {
        store_id: store_id,
        review_type: 'store',
        is_verified: true
      },
      attributes: [
        [db.sequelize.fn('AVG', db.sequelize.col('rating')), 'averageRating'],
        [db.sequelize.fn('COUNT', db.sequelize.col('review_id')), 'totalReviews']
      ],
      raw: true
    });

    // حساب إحصائيات الطلبات (إذا كان لديك جدول Orders)
    let orderStats = {
      totalOrders: 0,
      totalRevenue: "0.00",
      ordersByStatus: { shipped: 0 },
      averageOrderValue: "0.00"
    };

    const stats = stockStats[0];
    const productReviews = reviewStats[0];
    const storeReviews = storeReviewStats[0];

    // تنسيق البيانات النهائية
    const storeData = store.toJSON();
    
    const response = {
      store_id: storeData.store_id,
      user_id: storeData.user_id,
      store_name: storeData.store_name,
      store_address: storeData.store_address,
      description: storeData.description,
      images: storeData.images,
      logo_image: storeData.logo_image,
      created_at: storeData.created_at,
      User: {
        username: storeData.User.username,
        whatsapp_number: storeData.User.whatsapp_number
      },
      Products: formattedProducts,
      statistics: {
        // إحصائيات المنتجات
        totalProducts: parseInt(stats.total) || 0,
        availableProducts: parseInt(stats.available) || 0,
        outOfStockProducts: parseInt(stats.out_of_stock) || 0,
        lowStockProducts: parseInt(stats.low_stock) || 0,
        
        // إحصائيات تقييمات المنتجات
        products: {
          averageRating: productReviews.averageRating ? parseFloat(parseFloat(productReviews.averageRating).toFixed(1)) : 0,
          totalReviews: parseInt(productReviews.totalReviews) || 0
        },
        
        // إحصائيات تقييمات المتجر (إضافة جديدة)
        store: {
          averageRating: storeReviews.averageRating ? parseFloat(parseFloat(storeReviews.averageRating).toFixed(1)) : 0,
          totalReviews: parseInt(storeReviews.totalReviews) || 0
        },
        
        // إحصائيات عامة للتقييمات (مجموع تقييمات المنتجات والمتجر)
        overallRating: {
          averageRating: ((productReviews.averageRating || 0) + (storeReviews.averageRating || 0)) / 2,
          totalReviews: (parseInt(productReviews.totalReviews) || 0) + (parseInt(storeReviews.totalReviews) || 0)
        },
        
        // إحصائيات الطلبات
        totalOrders: orderStats.totalOrders,
        totalRevenue: orderStats.totalRevenue,
        ordersByStatus: orderStats.ordersByStatus,
        averageOrderValue: orderStats.averageOrderValue
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / parseInt(limit)),
        totalProducts: count,
        productsPerPage: parseInt(limit),
        hasNextPage: parseInt(page) < Math.ceil(count / parseInt(limit)),
        hasPrevPage: parseInt(page) > 1
      },
      filters: {
        name: name || null,
        stockStatus: stockStatus || null,
        appliedFilters: {
          nameSearch: !!name,
          stockFilter: !!stockStatus
        }
      }
    };

    res.status(200).json(response);

  } catch (error) {
    console.error('Error in filterStoreProducts:', error);
    res.status(500).json({ 
      success: false,
      error: 'حدث خطأ في السيرفر',
      message: error.message 
    });
  }
};

// تابع مساعد للحصول على إحصائيات المخزون لمتجر معين (محدث)
exports.getStoreStockStatistics = async (req, res) => {
  try {
    const { store_id } = req.params;

    const stockStats = await db.Product.findAll({
      where: { store_id },
      attributes: [
        [db.sequelize.fn('COUNT', db.sequelize.col('product_id')), 'total'],
        [db.sequelize.fn('SUM', 
          db.sequelize.literal('CASE WHEN stock_quantity > 5 THEN 1 ELSE 0 END')
        ), 'available'],
        [db.sequelize.fn('SUM', 
          db.sequelize.literal('CASE WHEN stock_quantity BETWEEN 1 AND 5 THEN 1 ELSE 0 END')
        ), 'low_stock'],
        [db.sequelize.fn('SUM', 
          db.sequelize.literal('CASE WHEN stock_quantity = 0 THEN 1 ELSE 0 END')
        ), 'out_of_stock']
      ],
      raw: true
    });

    const stats = stockStats[0];
    
    res.status(200).json({
      success: true,
      data: {
        totalProducts: parseInt(stats.total) || 0,
        availableProducts: parseInt(stats.available) || 0,
        lowStockProducts: parseInt(stats.low_stock) || 0,
        outOfStockProducts: parseInt(stats.out_of_stock) || 0,
        percentages: {
          available: stats.total > 0 ? ((parseInt(stats.available) / parseInt(stats.total)) * 100).toFixed(1) : 0,
          lowStock: stats.total > 0 ? ((parseInt(stats.low_stock) / parseInt(stats.total)) * 100).toFixed(1) : 0,
          outOfStock: stats.total > 0 ? ((parseInt(stats.out_of_stock) / parseInt(stats.total)) * 100).toFixed(1) : 0
        }
      }
    });

  } catch (error) {
    console.error('Error in getStoreStockStatistics:', error);
    res.status(500).json({ 
      success: false,
      error: 'حدث خطأ في السيرفر' 
    });
  }
};
