const db = require('../models');
const multer = require('multer');
const path = require('path');
// تأكد من استيراد db بشكل صحيح
const { Op, QueryTypes } = require('sequelize');

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
}).fields([
  { name: 'images', maxCount: 10 }, // صور المتجر
  { name: 'logo_image', maxCount: 1 } // شعار المتجر
]);

// إنشاء متجر جديد
exports.createStore = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    try {
      const { store_name, store_address, description } = req.body;
      const user_id = req.user.user_id;

      // التحقق من عدم وجود متجر للمستخدم مسبقاً (إذا كنت تريد متجر واحد لكل مستخدم)
      const existingStore = await db.Store.findOne({ where: { user_id } });
      if (existingStore) {
        return res.status(400).json({ error: 'لديك متجر موجود مسبقاً' });
      }

      const images = req.files['images']?.map(file => `/uploads/${file.filename}`) || [];
      const logo_image = req.files['logo_image']?.[0] ? `/uploads/${req.files['logo_image'][0].filename}` : null;

      const storeData = {
        user_id,
        store_name,
        store_address,
        description,
        images: JSON.stringify(images),
        logo_image
      };

      const store = await db.Store.create(storeData);
      res.status(201).json(store);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'حدث خطأ في السيرفر' });
    }
  });
};
// الحصول على جميع المتاجر
exports.getAllStores = async (req, res) => {
  try {
    const { search } = req.query;
    
    // الحصول على بداية الشهر الحالي
    const currentDate = new Date();
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);

    // بناء شرط البحث مع استبعاد المتاجر المحظورة
    let searchCondition = 'WHERE s.is_blocked = false'; // استبعاد المتاجر المحظورة
    let searchParams = [];
    
    if (search) {
      searchCondition += ' AND s.store_name LIKE ?';
      searchParams.push(`%${search}%`);
    }

    // استعلام شامل للحصول على جميع البيانات مرة واحدة (فقط المتاجر غير المحظورة)
    const storesQuery = `
      SELECT 
        s.*,
        u.username,
        u.whatsapp_number,
        COALESCE(AVG(r.rating), 0) as averageRating,
        COUNT(DISTINCT r.review_id) as reviewsCount,
        COALESCE(SUM(o.total_price), 0) as totalRevenue,
        COUNT(DISTINCT o.order_id) as totalOrders,
        COALESCE(SUM(CASE 
          WHEN o.created_at >= ? THEN o.total_price 
          ELSE 0 
        END), 0) as thisMonthRevenue
      FROM Stores s
      LEFT JOIN Users u ON s.user_id = u.user_id
      LEFT JOIN Reviews r ON s.store_id = r.store_id
      LEFT JOIN Orders o ON s.store_id = o.store_id
      ${searchCondition}
      GROUP BY s.store_id
      ORDER BY s.created_at DESC
    `;

    // تحضير المعاملات
    const queryParams = [firstDayOfMonth, ...searchParams];

    // تنفيذ الاستعلام
    const stores = await db.sequelize.query(storesQuery, {
      replacements: queryParams,
      type: QueryTypes.SELECT
    });

    // الحصول على الإحصائيات العامة (تشمل جميع المتاجر للإحصائيات)
    const statisticsQuery = `
      SELECT 
        COUNT(*) as totalStores,
        SUM(CASE WHEN is_blocked = false THEN 1 ELSE 0 END) as activeStores,
        SUM(CASE WHEN is_blocked = true THEN 1 ELSE 0 END) as blockedStores
      FROM Stores
    `;

    const [statistics] = await db.sequelize.query(statisticsQuery, {
      type: QueryTypes.SELECT
    });

    // الحصول على إجمالي مبيعات الموقع (فقط من المتاجر غير المحظورة)
    const totalSiteRevenueQuery = `
      SELECT COALESCE(SUM(o.total_price), 0) as totalSiteRevenue
      FROM Orders o
      INNER JOIN Stores s ON o.store_id = s.store_id
      WHERE s.is_blocked = false
    `;

    const [siteRevenue] = await db.sequelize.query(totalSiteRevenueQuery, {
      type: QueryTypes.SELECT
    });

    // تنسيق بيانات المتاجر
    const formattedStores = stores.map(store => {
      const images = JSON.parse(store.images || '[]');
      
      return {
        store_id: store.store_id,
        user_id: store.user_id,
        store_name: store.store_name,
        store_address: store.store_address,
        description: store.description,
        images,
        logo_image: store.logo_image,
        is_blocked: store.is_blocked, // ستكون دائماً false في البيانات المرجعة
        created_at: store.created_at,
        User: {
          username: store.username,
          whatsapp_number: store.whatsapp_number
        },
        averageRating: parseFloat(parseFloat(store.averageRating).toFixed(1)),
        reviewsCount: parseInt(store.reviewsCount),
        totalRevenue: parseFloat(parseFloat(store.totalRevenue).toFixed(2)),
        totalOrders: parseInt(store.totalOrders),
        thisMonthRevenue: parseFloat(parseFloat(store.thisMonthRevenue).toFixed(2))
      };
    });

    // الاستجابة النهائية
    res.status(200).json({
      stores: formattedStores,
      statistics: {
        totalStores: parseInt(statistics.totalStores),
        activeStores: parseInt(statistics.activeStores),
        blockedStores: parseInt(statistics.blockedStores),
        totalSiteRevenue: parseFloat(parseFloat(siteRevenue.totalSiteRevenue).toFixed(2))
      }
    });

  } catch (error) {
    console.error('Error in getAllStores:', error);
    res.status(500).json({ 
      error: 'حدث خطأ في السيرفر',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
// الحصول على متجر بواسطة المعرف
// دالة getStoreById المصححة مع دعم الخصومات
exports.getStoreById = async (req, res) => {
  try {
    const storeId = req.params.id;

    const store = await db.Store.findByPk(storeId, {
      include: [
        {
          model: db.User,
          attributes: ['username', 'whatsapp_number', 'role']
        },
        {
          model: db.Product,
          required: false,
          include: [
            {
              model: db.Review,
              as: 'reviews',
              required: false,
              where: { review_type: 'product' }, // إزالة شرط is_verified
              attributes: ['rating', 'comment', 'created_at', 'reviewer_name', 'is_verified']
            }
          ]
        },
        {
          model: db.Review,
          as: 'storeReviews',
          required: false,
          where: { review_type: 'store' }, // إزالة شرط is_verified
          attributes: ['rating', 'comment', 'created_at', 'reviewer_name', 'is_verified']
        },
        {
          model: db.Order,
          required: false,
          attributes: ['order_id', 'total_price', 'status', 'created_at']
        }
      ]
    });

    if (!store) {
      return res.status(404).json({ 
        error: 'المتجر غير موجود' 
      });
    }

    // تنسيق البيانات
    const images = JSON.parse(store.images || '[]');
    
    // حساب متوسط تقييم المتجر (التقييمات المباشرة للمتجر)
    const storeReviews = store.storeReviews || [];
    const averageStoreRating = storeReviews.length > 0 
      ? (storeReviews.reduce((sum, review) => sum + review.rating, 0) / storeReviews.length).toFixed(1)
      : 0;

    // حساب إحصائيات المتجر
    const orders = store.Orders || [];
    const totalRevenue = orders.reduce((sum, order) => sum + parseFloat(order.total_price), 0);
    const totalOrders = orders.length;

    // حساب مبيعات الشهر الحالي
    const currentDate = new Date();
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const thisMonthRevenue = orders
      .filter(order => new Date(order.created_at) >= firstDayOfMonth)
      .reduce((sum, order) => sum + parseFloat(order.total_price), 0);

    // تنسيق بيانات المنتجات مع معلومات الخصم
    const products = (store.Products || []).map(product => {
      const productImages = JSON.parse(product.images || '[]');
      const productReviews = product.reviews || [];
      const averageProductRating = productReviews.length > 0
        ? (productReviews.reduce((sum, review) => sum + review.rating, 0) / productReviews.length).toFixed(1)
        : 0;

      // حساب معلومات الخصم للمنتج
      const originalPrice = parseFloat(product.price);
      let discountedPrice = originalPrice;
      let discountAmount = 0;
      let hasDiscount = false;
      
      if (product.discount_percentage && product.discount_percentage > 0) {
        const discountPercent = parseFloat(product.discount_percentage);
        discountAmount = (originalPrice * discountPercent) / 100;
        discountedPrice = originalPrice - discountAmount;
        hasDiscount = true;
      }

      return {
        ...product.toJSON(),
        images: productImages,
        averageRating: parseFloat(averageProductRating),
        reviewsCount: productReviews.length,
        // معلومات الخصم
        original_price: originalPrice,
        discounted_price: parseFloat(discountedPrice.toFixed(2)),
        discount_amount: parseFloat(discountAmount.toFixed(2)),
        has_discount: hasDiscount,
        // معلومات التقييمات مع حالة التحقق
        reviews: productReviews.map(review => ({
          rating: review.rating,
          comment: review.comment,
          reviewer_name: review.reviewer_name,
          created_at: review.created_at,
          is_verified: review.is_verified
        }))
      };
    });

    // حساب متوسط التقييم الشامل (تقييمات المتجر + تقييمات المنتجات)
    const allProductReviews = products.reduce((acc, product) => {
      return acc.concat(product.reviews || []);
    }, []);
    
    const allReviews = [...storeReviews, ...allProductReviews];
    const overallAverageRating = allReviews.length > 0
      ? (allReviews.reduce((sum, review) => sum + review.rating, 0) / allReviews.length).toFixed(1)
      : 0;

    // حساب إحصائيات الخصومات للمتجر
    const productsWithDiscount = products.filter(product => product.has_discount);
    const totalDiscountedProducts = productsWithDiscount.length;
    const totalDiscountValue = productsWithDiscount.reduce((sum, product) => 
      sum + product.discount_amount, 0
    );

    // إحصائيات التقييمات (محققة وغير محققة)
    const verifiedReviews = allReviews.filter(review => review.is_verified);
    const pendingReviews = allReviews.filter(review => !review.is_verified);

    // تنسيق الاستجابة النهائية
    const formattedStore = {
      ...store.toJSON(),
      images,
      // تقييمات المتجر المباشرة
      storeAverageRating: parseFloat(averageStoreRating),
      storeReviewsCount: storeReviews.length,
      // التقييم الشامل (متجر + منتجات)
      overallAverageRating: parseFloat(overallAverageRating),
      totalReviewsCount: allReviews.length,
      // إحصائيات التقييمات
      reviewStats: {
        total: allReviews.length,
        verified: verifiedReviews.length,
        pending: pendingReviews.length
      },
      // إحصائيات مالية
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      totalOrders,
      thisMonthRevenue: parseFloat(thisMonthRevenue.toFixed(2)),
      // إحصائيات الخصومات
      discountStats: {
        totalProductsWithDiscount: totalDiscountedProducts,
        totalProducts: products.length,
        totalDiscountValue: parseFloat(totalDiscountValue.toFixed(2)),
        discountPercentage: products.length > 0 ? 
          parseFloat(((totalDiscountedProducts / products.length) * 100).toFixed(1)) : 0
      },
      products,
      // إزالة البيانات المكررة
      Products: undefined,
      Orders: undefined,
      // تقييمات المتجر المباشرة فقط
      storeReviews: storeReviews.map(review => ({
        rating: review.rating,
        comment: review.comment,
        reviewer_name: review.reviewer_name,
        created_at: review.created_at,
        is_verified: review.is_verified
      }))
    };

    res.status(200).json({
      success: true,
      store: formattedStore
    });

  } catch (error) {
    console.error('Error in getStoreById:', error);
    res.status(500).json({ 
      error: 'حدث خطأ في السيرفر',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// دالة مساعدة للحصول على متجر مع إحصائيات مبسطة
exports.getStoreStats = async (req, res) => {
  try {
    const storeId = req.params.id;

    const store = await db.Store.findByPk(storeId, {
      include: [
        {
          model: db.User,
          attributes: ['username', 'whatsapp_number']
        },
        {
          model: db.Review,
          as: 'reviews',
          attributes: ['rating']
        },
        {
          model: db.Order,
          attributes: ['total_price', 'created_at']
        },
        {
          model: db.Product,
          attributes: ['product_id', 'product_name', 'price']
        }
      ]
    });

    if (!store) {
      return res.status(404).json({ error: 'المتجر غير موجود' });
    }

    // حساب الإحصائيات
    const reviews = store.reviews || [];
    const orders = store.Orders || [];
    const products = store.Products || [];

    const averageRating = reviews.length > 0 
      ? (reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1)
      : 0;

    const totalRevenue = orders.reduce((sum, order) => sum + parseFloat(order.total_price), 0);

    // مبيعات الشهر الحالي
    const currentDate = new Date();
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const thisMonthRevenue = orders
      .filter(order => new Date(order.created_at) >= firstDayOfMonth)
      .reduce((sum, order) => sum + parseFloat(order.total_price), 0);

    res.status(200).json({
      success: true,
      store: {
        store_id: store.store_id,
        store_name: store.store_name,
        is_blocked: store.is_blocked,
        statistics: {
          averageRating: parseFloat(averageRating),
          totalReviews: reviews.length,
          totalProducts: products.length,
          totalOrders: orders.length,
          totalRevenue: parseFloat(totalRevenue.toFixed(2)),
          thisMonthRevenue: parseFloat(thisMonthRevenue.toFixed(2))
        }
      }
    });

  } catch (error) {
    console.error('Error in getStoreStats:', error);
    res.status(500).json({ 
      error: 'حدث خطأ في السيرفر',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
// تحديث متجر
exports.updateStore = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    try {
      const store = await db.Store.findByPk(req.params.id);
      if (!store) {
        return res.status(404).json({ error: 'المتجر غير موجود' });
      }

      // التحقق من ملكية المتجر
      if (store.user_id !== req.user.user_id) {
        return res.status(403).json({ error: 'غير مصرح لك بتعديل هذا المتجر' });
      }

      let updatedData = { ...req.body };

      // إذا تم رفع صور جديدة
      if (req.files['images'] && req.files['images'].length > 0) {
        const images = req.files['images'].map(file => `/uploads/${file.filename}`);
        updatedData.images = JSON.stringify(images);
      }

      // إذا تم رفع شعار جديد
      if (req.files['logo_image'] && req.files['logo_image'][0]) {
        updatedData.logo_image = `/uploads/${req.files['logo_image'][0].filename}`;
      }

      await store.update(updatedData);
      res.status(200).json(store);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'حدث خطأ في السيرفر' });
    }
  });
};

// حذف متجر
exports.deleteStore = async (req, res) => {
  try {
    const store = await db.Store.findByPk(req.params.id);
    if (!store) {
      return res.status(404).json({ error: 'المتجر غير موجود' });
    }

    // التحقق من الصلاحيات - يمكن للأدمن أو صاحب المتجر حذف المتجر
   
    const isAdmin = req.user.role === 'admin';
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'غير مصرح لك بحذف هذا المتجر' });
    }

    await store.destroy();
    res.status(200).json({ message: 'تم حذف المتجر بنجاح' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على متجر المستخدم
exports.getMyStore = async (req, res) => {
  try {
    const store = await db.Store.findOne({
      where: { user_id: req.user.user_id },
      include: [
        {
          model: db.Product,
          as: 'Products'
        }
      ]
    });

    if (!store) {
      return res.status(404).json({ error: 'لا تملك متجراً حتى الآن' });
    }

    store.images = JSON.parse(store.images || '[]');
    res.status(200).json(store);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};
// البحث عن المتاجر بالاسم
exports.searchStores = async (req, res) => {
  try {
    const { name } = req.query;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'اسم المتجر مطلوب للبحث' });
    }

    // البحث عن المتاجر أولاً
    const stores = await db.Store.findAll({
      where: {
        store_name: {
          [db.Sequelize.Op.like]: `%${name.trim()}%`
        }
      },
      attributes: [
        'store_id',
        'store_name',
        'store_address',
        'description',
        'images',
        'logo_image',
        'created_at'
      ],
      order: [['store_name', 'ASC']]
    });

    if (stores.length === 0) {
      return res.status(404).json({ 
        message: 'لم يتم العثور على متاجر بهذا الاسم',
        stores: []
      });
    }

    // معالجة كل متجر وإضافة التقييمات
    const formattedStores = await Promise.all(stores.map(async (store) => {
      const storeData = store.toJSON();
      
      // تنسيق الصور
      if (storeData.images) {
        try {
          storeData.images = JSON.parse(storeData.images || '[]');
        } catch (error) {
          console.warn('خطأ في تحليل صور المتجر:', error);
          storeData.images = [];
        }
      } else {
        storeData.images = [];
      }

      // الحصول على التقييمات للمتجر
      const storeReviews = await db.Review.findAll({
        where: {
          store_id: storeData.store_id,
          review_type: 'store'
        },
        attributes: ['rating'],
        raw: true
      });

      // حساب متوسط التقييمات
      let averageRating = 0;
      let totalReviews = storeReviews.length;
      
      if (totalReviews > 0) {
        const ratingsSum = storeReviews.reduce((sum, review) => sum + review.rating, 0);
        averageRating = ratingsSum / totalReviews;
      }

      // إضافة معلومات التقييم
      storeData.rating = {
        average: averageRating > 0 ? averageRating.toFixed(1) : '0.0',
        total_reviews: totalReviews,
        has_reviews: totalReviews > 0
      };

      return storeData;
    }));

    res.status(200).json({
      message: `تم العثور على ${formattedStores.length} متجر`,
      count: formattedStores.length,
      stores: formattedStores
    });

  } catch (error) {
    console.error('خطأ في البحث عن المتاجر:', error);
    res.status(500).json({ 
      error: 'حدث خطأ في السيرفر',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
// تابع لتغيير حالة المتجر (حظر/إلغاء حظر)
exports.toggleStoreStatus = async (req, res) => {
  try {
    const storeId = req.params.id;
    
    // العثور على المتجر
    const store = await db.Store.findByPk(storeId);
    
    if (!store) {
      return res.status(404).json({ 
        error: 'المتجر غير موجود' 
      });
    }

    // تغيير حالة الحظر (إذا كان محظور يصبح متاح والعكس)
    const newBlockedStatus = !store.is_blocked;
    
    // تحديث حالة المتجر
    await store.update({
      is_blocked: newBlockedStatus
    });

    // رسالة تأكيد حسب الحالة الجديدة
    const statusMessage = newBlockedStatus ? 'تم حظر المتجر بنجاح' : 'تم إلغاء حظر المتجر بنجاح';

    res.status(200).json({
      success: true,
      message: statusMessage,
      store: {
        store_id: store.store_id,
        store_name: store.store_name,
        is_blocked: newBlockedStatus
      }
    });

  } catch (error) {
    console.error('Error in toggleStoreStatus:', error);
    res.status(500).json({ 
      error: 'حدث خطأ في السيرفر',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
