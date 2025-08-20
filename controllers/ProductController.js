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

// إنشاء منتج جديد
exports.createProduct = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    try {
      const { name, description, price, stock_quantity, store_id } = req.body;

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

// الحصول على منتج بواسطة المعرف
exports.getProductById = async (req, res) => {
  try {
    const product = await db.Product.findByPk(req.params.id, {
      include: [
        {
          model: db.Store,
          as: 'Store',
          attributes: ['store_name', 'logo_image', 'description']
        },
        {
          model: db.Review,
          as: 'Reviews',
          where: { is_verified: true },
          required: false
        }
      ]
    });

    if (!product) {
      return res.status(404).json({ error: 'المنتج غير موجود' });
    }

    product.images = JSON.parse(product.images || '[]');
    res.status(200).json(product);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// تحديث منتج
exports.updateProduct = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    try {
      const product = await db.Product.findByPk(req.params.id, {
        include: [{ model: db.Store, as: 'Store' }]  // بحرف كبير
      });

      if (!product) {
        return res.status(404).json({ error: 'المنتج غير موجود' });
      }

      // التحقق من ملكية المتجر
      if (product.Store.user_id !== req.user.user_id) {  // بحرف كبير
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

      await product.update(updatedData);
      res.status(200).json(product);
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