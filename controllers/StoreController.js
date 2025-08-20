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
    let whereClause = {};

    if (search) {
      whereClause.store_name = { [db.Sequelize.Op.like]: `%${search}%` };
    }

    const stores = await db.Store.findAll({
      where: whereClause,
      include: [
        {
          model: db.User,
          as: 'User',
          attributes: ['username', 'whatsapp_number']
        }
      ]
    });

    const formattedStores = stores.map(store => {
      const images = JSON.parse(store.images || '[]');
      return {
        ...store.toJSON(),
        images
      };
    });

    res.status(200).json(formattedStores);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على متجر بواسطة المعرف
exports.getStoreById = async (req, res) => {
  try {
    const store = await db.Store.findByPk(req.params.id, {
      include: [
        {
          model: db.User,
          as: 'User',
          attributes: ['username', 'whatsapp_number']
        },
        {
          model: db.Product,
          as: 'Products',
          limit: 10 // عرض أول 10 منتجات
        }
      ]
    });

    if (!store) {
      return res.status(404).json({ error: 'المتجر غير موجود' });
    }

    store.images = JSON.parse(store.images || '[]');
    res.status(200).json(store);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
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

    // التحقق من ملكية المتجر
    if (store.user_id !== req.user.user_id) {
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