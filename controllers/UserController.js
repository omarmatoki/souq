const db = require('../models');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');

const SECRET_KEY = process.env.SECRET_KEY;

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

// إعداد Multer لتحميل صور الهوية
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // حد أقصى 5MB
}).single('id_image');

// تسجيل مستخدم جديد
exports.register = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    try {
      const { username, password, whatsapp_number, role = 'merchant' } = req.body;

      // باقي الكود يبقى كما هو...
      if (!username || !password) {
        return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
      }

      const existingUser = await db.User.findOne({ where: { username } });
      if (existingUser) {
        return res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' });
      }

      const saltRounds = 10;
      const password_hash = await bcrypt.hash(password, saltRounds);
      const id_image = req.file ? `/uploads/${req.file.filename}` : null;

      const userData = {
        username,
        password_hash,
        whatsapp_number,
        id_image,
        role: 'merchant' // تثبيت القيمة كـ merchant دائماً
      };

      const user = await db.User.create(userData);

      const token = jwt.sign(
        { user_id: user.user_id, username: user.username, role: user.role },
        SECRET_KEY,
        { expiresIn: '24h' }
      );

      const { password_hash: _, ...userWithoutPassword } = user.toJSON();

      res.status(201).json({
        message: 'تم إنشاء الحساب بنجاح',
        user: userWithoutPassword,
        token
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'حدث خطأ في السيرفر' });
    }
  });
};

// تسجيل الدخول
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // التحقق من البيانات المطلوبة
    if (!username || !password) {
      return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
    }

    // البحث عن المستخدم مع متجره (إن وجد)
    const user = await db.User.findOne({ 
      where: { username },
      include: [{
        model: db.Store,
        required: false, // LEFT JOIN - لا يتطلب وجود متجر
        attributes: ['store_id', 'store_name'] // نجلب فقط معرف المتجر واسمه
      }]
    });

    if (!user) {
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    // التحقق من كلمة المرور
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    // إعداد payload للتوكن
    const tokenPayload = {
      user_id: user.user_id,
      username: user.username,
      role: user.role
    };

    // إضافة store_id إلى التوكن إذا كان لدى المستخدم متجر
    if (user.Stores && user.Stores.length > 0) {
      tokenPayload.store_id = user.Stores[0].store_id;
    } else {
      tokenPayload.store_id = null;
    }

    // إنشاء JWT token
    const token = jwt.sign(tokenPayload, SECRET_KEY, { expiresIn: '24h' });

    // إعداد بيانات المستخدم للإرجاع (بدون كلمة المرور)
    const { password_hash: _, ...userWithoutPassword } = user.toJSON();

    res.status(200).json({
      message: 'تم تسجيل الدخول بنجاح',
      user: {
        ...userWithoutPassword,
        store: user.Stores && user.Stores.length > 0 ? {
          store_id: user.Stores[0].store_id,
          store_name: user.Stores[0].store_name
        } : null
      },
      token
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على جميع المستخدمين (للمسؤولين فقط)
exports.getAllUsers = async (req, res) => {
  try {
    // التحقق من صلاحية المسؤول
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'غير مصرح لك بعرض قائمة المستخدمين' });
    }

    const { role, search, page = 1, limit = 10 } = req.query;
    let whereClause = {};

    if (role) {
      whereClause.role = role;
    }

    if (search) {
      whereClause.username = { [db.Sequelize.Op.like]: `%${search}%` };
    }

    const offset = (page - 1) * limit;

    const { count, rows: users } = await db.User.findAndCountAll({
      where: whereClause,
      attributes: { exclude: ['password_hash'] }, // استبعاد كلمة المرور
      include: [
        {
          model: db.Store,
          as: 'Stores',
          required: false,
          attributes: ['store_id', 'store_name', 'created_at']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.status(200).json({
      users,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على بيانات مستخدم معين
exports.getUserById = async (req, res) => {
  try {
    const user = await db.User.findByPk(req.params.id, {
      attributes: { exclude: ['password_hash'] }, // استبعاد كلمة المرور
      include: [
        {
          model: db.Store,
          as: 'Stores',
          required: false,
          include: [
            {
              model: db.Product,
              as: 'Products',
              limit: 5 // عرض أول 5 منتجات فقط
            }
          ]
        }
      ]
    });

    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    // التحقق من الصلاحية (المستخدم نفسه أو المسؤول)
    if (req.user.user_id !== user.user_id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'غير مصرح لك بعرض هذه البيانات' });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// تحديث بيانات المستخدم
exports.updateUser = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    try {
      const user = await db.User.findByPk(req.params.id);
      if (!user) {
        return res.status(404).json({ error: 'المستخدم غير موجود' });
      }

      // التحقق من الصلاحية (المستخدم نفسه أو المسؤول)
      if (req.user.user_id !== user.user_id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح لك بتعديل هذه البيانات' });
      }

      let updatedData = { ...req.body };

      // إزالة الحقول غير المسموح تعديلها
      delete updatedData.user_id;
      delete updatedData.created_at;

      // إذا تم رفع صورة هوية جديدة
      if (req.file) {
        updatedData.id_image = `/uploads/${req.file.filename}`;
      }

      // إذا تم تغيير كلمة المرور
      if (updatedData.password) {
        if (updatedData.password.length < 6) {
          return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
        }
        const saltRounds = 10;
        updatedData.password_hash = await bcrypt.hash(updatedData.password, saltRounds);
        delete updatedData.password; // حذف كلمة المرور من البيانات
      }

      // التحقق من تفرد اسم المستخدم إذا تم تغييره
      if (updatedData.username && updatedData.username !== user.username) {
        const existingUser = await db.User.findOne({ 
          where: { 
            username: updatedData.username,
            user_id: { [db.Sequelize.Op.ne]: user.user_id }
          } 
        });
        if (existingUser) {
          return res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' });
        }
      }

      // منع تغيير الدور إلا من قبل المسؤول
      if (updatedData.role && req.user.role !== 'admin') {
        delete updatedData.role;
      }

      await user.update(updatedData);

      // إرجاع البيانات بدون كلمة المرور
      const { password_hash: _, ...userWithoutPassword } = user.toJSON();
      res.status(200).json({
        message: 'تم تحديث البيانات بنجاح',
        user: userWithoutPassword
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'حدث خطأ في السيرفر' });
    }
  });
};

// حذف مستخدم
exports.deleteUser = async (req, res) => {
  try {
    const user = await db.User.findByPk(req.params.id, {
      include: [
        {
          model: db.Store,
          as: 'Stores'
        }
      ]
    });

    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    // التحقق من الصلاحية (المستخدم نفسه أو المسؤول)
    if (req.user.user_id !== user.user_id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'غير مصرح لك بحذف هذا المستخدم' });
    }

    // التحقق من وجود متاجر مرتبطة
    if (user.Stores && user.Stores.length > 0) {
      return res.status(400).json({ 
        error: 'لا يمكن حذف المستخدم لوجود متاجر مرتبطة به. يجب حذف المتاجر أولاً' 
      });
    }

    await user.destroy();
    res.status(200).json({ message: 'تم حذف المستخدم بنجاح' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على ملف المستخدم الشخصي
exports.getProfile = async (req, res) => {
  try {
    const user = await db.User.findByPk(req.user.user_id, {
      attributes: { exclude: ['password_hash'] }, // استبعاد كلمة المرور
      include: [
        {
          model: db.Store,
          as: 'Stores',
          required: false,
          include: [
            {
              model: db.Product,
              as: 'Products',
              attributes: ['product_id', 'name', 'price', 'stock_quantity']
            }
          ]
        }
      ]
    });

    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    // حساب إحصائيات المستخدم
    const stats = {};
    if (user.Stores && user.Stores.length > 0) {
      stats.totalStores = user.Stores.length;
      stats.totalProducts = user.Stores.reduce((total, store) => 
        total + (store.Products ? store.Products.length : 0), 0
      );
    }

    res.status(200).json({
      user,
      stats
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// تغيير كلمة المرور
exports.changePassword = async (req, res) => {
  try {
    const { current_password, new_password, confirm_password } = req.body;

    // التحقق من البيانات المطلوبة
    if (!current_password || !new_password || !confirm_password) {
      return res.status(400).json({ 
        error: 'كلمة المرور الحالية والجديدة وتأكيدها مطلوبة' 
      });
    }

    // التحقق من تطابق كلمة المرور الجديدة
    if (new_password !== confirm_password) {
      return res.status(400).json({ error: 'كلمة المرور الجديدة غير متطابقة' });
    }

    // التحقق من طول كلمة المرور الجديدة
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    }

    const user = await db.User.findByPk(req.user.user_id);
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    // التحقق من كلمة المرور الحالية
    const isCurrentPasswordValid = await bcrypt.compare(current_password, user.password_hash);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' });
    }

    // تشفير كلمة المرور الجديدة
    const saltRounds = 10;
    const new_password_hash = await bcrypt.hash(new_password, saltRounds);

    await user.update({ password_hash: new_password_hash });
    res.status(200).json({ message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// التحقق من صحة التوكن
exports.verifyToken = async (req, res) => {
  try {
    const user = await db.User.findByPk(req.user.user_id, {
      attributes: { exclude: ['password_hash'] },
      include: [
        {
          model: db.Store,
          as: 'Stores',
          required: false,
          attributes: ['store_id', 'store_name']
        }
      ]
    });

    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    res.status(200).json({ 
      valid: true, 
      user,
      tokenInfo: {
        issued_at: new Date(req.user.iat * 1000),
        expires_at: new Date(req.user.exp * 1000)
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// تحديث دور المستخدم (للمسؤولين فقط)
exports.updateUserRole = async (req, res) => {
  try {
    // التحقق من صلاحية المسؤول
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'غير مصرح لك بتغيير أدوار المستخدمين' });
    }

    const { role } = req.body;
    const validRoles = ['merchant', 'admin'];

    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'الدور غير صالح' });
    }

    const user = await db.User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    await user.update({ role });

    const { password_hash: _, ...userWithoutPassword } = user.toJSON();
    res.status(200).json({
      message: 'تم تحديث دور المستخدم بنجاح',
      user: userWithoutPassword
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// البحث عن المستخدمين
exports.searchUsers = async (req, res) => {
  try {
    // التحقق من صلاحية المسؤول
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'غير مصرح لك بالبحث في قائمة المستخدمين' });
    }

    const { q, role } = req.query;
    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'يجب أن يكون البحث حرفين على الأقل' });
    }

    let whereClause = {
      [db.Sequelize.Op.or]: [
        { username: { [db.Sequelize.Op.like]: `%${q}%` } },
        { whatsapp_number: { [db.Sequelize.Op.like]: `%${q}%` } }
      ]
    };

    if (role) {
      whereClause.role = role;
    }

    const users = await db.User.findAll({
      where: whereClause,
      attributes: { exclude: ['password_hash'] },
      include: [
        {
          model: db.Store,
          as: 'Stores',
          required: false,
          attributes: ['store_id', 'store_name']
        }
      ],
      limit: 20,
      order: [['username', 'ASC']]
    });

    res.status(200).json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// إحصائيات المستخدمين (للمسؤولين فقط)
exports.getUsersStats = async (req, res) => {
  try {
    // التحقق من صلاحية المسؤول
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'غير مصرح لك بعرض إحصائيات المستخدمين' });
    }

    const totalUsers = await db.User.count();
    const totalMerchants = await db.User.count({ where: { role: 'merchant' } });
    const totalAdmins = await db.User.count({ where: { role: 'admin' } });
    const totalStores = await db.Store.count();

    // المستخدمين الجدد هذا الشهر
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    const newUsersThisMonth = await db.User.count({
      where: {
        created_at: {
          [db.Sequelize.Op.gte]: currentMonth
        }
      }
    });

    const stats = {
      totalUsers,
      totalMerchants,
      totalAdmins,
      totalStores,
      newUsersThisMonth,
      usersWithStores: await db.User.count({
        include: [
          {
            model: db.Store,
            as: 'Stores',
            required: true
          }
        ]
      })
    };

    res.status(200).json(stats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};