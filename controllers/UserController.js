const db = require('../models');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const whatsappService = require('../config/whatsapp');

const SECRET_KEY = process.env.SECRET_KEY;
const SECURITY_CONFIG = {
  MAX_FAILED_ATTEMPTS: 5,
  LOCKOUT_DURATION: 15 * 60 * 1000, // 15 دقيقة
  PROGRESSIVE_DELAYS: [0, 1000, 2000, 5000, 10000] // تأخير تدريجي
};

// إعداد تخزين الملفات باستخدام Multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    return cb(new Error('❌ فقط الملفات بصيغة JPEG, JPG, PNG, GIF, و WEBP مسموحة!'));
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
}).single('id_image');

// تسجيل مستخدم جديد
exports.register = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    try {
      const { username, password, whatsapp_number, role = 'merchant' } = req.body;

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
        role: 'merchant',
        is_verified: whatsapp_number ? false : true // إذا لم يكن هناك رقم واتساب، فعّل الحساب مباشرة
      };

      const user = await db.User.create(userData);

      // إرسال رمز التحقق تلقائياً إذا تم توفير رقم واتساب
      let verificationSent = false;
      if (whatsapp_number) {
        try {
          await whatsappService.sendVerificationCode(whatsapp_number, user.user_id);
          verificationSent = true;
        } catch (error) {
          console.error('فشل في إرسال رمز التحقق:', error);
        }
      }

      const { password_hash: _, ...userWithoutPassword } = user.toJSON();

      res.status(201).json({
        message: whatsapp_number 
          ? (verificationSent ? 'تم إنشاء الحساب بنجاح. تم إرسال رمز التحقق إلى الواتساب' : 'تم إنشاء الحساب بنجاح. فشل إرسال رمز التحقق')
          : 'تم إنشاء الحساب بنجاح',
        user: userWithoutPassword,
        requires_verification: !!whatsapp_number,
        verification_sent: verificationSent,
        next_step: whatsapp_number ? 'verify_whatsapp' : 'login'
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'حدث خطأ في السيرفر' });
    }
  });
};

// تغيير كلمة السر للمستخدمين المسجلين دخولهم
exports.changePassword = async (req, res) => {
  try {
    const { current_password, new_password, confirm_password } = req.body;
    const userId = req.user.user_id;

    // التحقق من وجود البيانات المطلوبة
    if (!current_password || !new_password || !confirm_password) {
      return res.status(400).json({
        success: false,
        message: 'جميع الحقول مطلوبة'
      });
    }

    // التحقق من تطابق كلمة المرور الجديدة
    if (new_password !== confirm_password) {
      return res.status(400).json({
        success: false,
        message: 'كلمة المرور الجديدة وتأكيد كلمة المرور غير متطابقتان'
      });
    }

    // التحقق من طول كلمة المرور
    if (new_password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'
      });
    }

    // البحث عن المستخدم - تصحيح استخدام db.User بدلاً من User
    const user = await db.User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'المستخدم غير موجود'
      });
    }

    // التحقق من كلمة المرور الحالية
    const isCurrentPasswordValid = await bcrypt.compare(current_password, user.password_hash);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'كلمة المرور الحالية غير صحيحة'
      });
    }

    // تشفير كلمة المرور الجديدة
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(new_password, saltRounds);

    // تحديث كلمة المرور
    await user.update({
      password_hash: newPasswordHash
    });

    res.status(200).json({
      success: true,
      message: 'تم تغيير كلمة المرور بنجاح'
    });

  } catch (error) {
    console.error('خطأ في تغيير كلمة المرور:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ في الخادم'
    });
  }
};

// الحل الأول: إضافة اختيار الدور في تسجيل الدخول

// دوال مساعدة
const getAttemptIdentifier = (req, username) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  return `${username}_${ip}`;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

exports.login = async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        error: 'اسم المستخدم وكلمة المرور مطلوبان',
        security_info: { type: 'validation_error' }
      });
    }

    const identifier = getAttemptIdentifier(req, username);
    const ip_address = req.ip || req.connection.remoteAddress || 'unknown';
    const user_agent = req.get('User-Agent') || '';

    // ===== الخطوة 1: التحقق من حالة الحظر =====
    let attemptRecord = null;
    
    if (db.LoginAttempts) {
      try {
        // تنظيف السجلات المنتهية الصلاحية
        await db.LoginAttempts.update(
          { is_active: false },
          {
            where: {
              locked_until: { [db.Sequelize.Op.lt]: new Date() },
              is_active: true
            }
          }
        );

        // البحث عن سجل المحاولات
        attemptRecord = await db.LoginAttempts.findOne({
          where: { identifier, is_active: true },
          order: [['updatedAt', 'DESC']]
        });

        // التحقق من الحظر
        if (attemptRecord && attemptRecord.locked_until && attemptRecord.locked_until > new Date()) {
          const remainingTime = Math.ceil((attemptRecord.locked_until - new Date()) / 1000 / 60);
          return res.status(429).json({
            error: 'تم حظر هذا الحساب مؤقتاً بسبب محاولات تسجيل دخول متكررة',
            security_info: {
              type: 'account_locked',
              remaining_minutes: remainingTime,
              unlock_at: attemptRecord.locked_until,
              total_failed_attempts: attemptRecord.failed_attempts,
              reason: 'تجاوز الحد المسموح من المحاولات الخاطئة'
            },
            retry_after: remainingTime * 60
          });
        }

        // تطبيق التأخير التدريجي
        if (attemptRecord && attemptRecord.failed_attempts > 0) {
          const delayIndex = Math.min(attemptRecord.failed_attempts, SECURITY_CONFIG.PROGRESSIVE_DELAYS.length - 1);
          const delay = SECURITY_CONFIG.PROGRESSIVE_DELAYS[delayIndex];
          if (delay > 0) {
            console.log(`تطبيق تأخير ${delay}ms للمحاولة رقم ${attemptRecord.failed_attempts + 1}`);
            await sleep(delay);
          }
        }
      } catch (securityError) {
        console.error('خطأ في نظام الأمان:', securityError);
        // المتابعة بدون نظام الأمان
      }
    }

    // ===== الخطوة 2: البحث عن المستخدم =====
    let whereClause = { username };
    if (role) {
      whereClause.role = role;
    }

    const users = await db.User.findAll({ 
      where: whereClause,
      include: [{
        model: db.Store,
        required: false,
        attributes: ['store_id', 'store_name']
      }]
    });

    // ===== الخطوة 3: التحقق من صحة المستخدم وكلمة المرور =====
    let isValidCredentials = false;
    let user = null;

    if (users.length === 0) {
      // مستخدم غير موجود
      isValidCredentials = false;
    } else if (users.length > 1 && !role) {
      // تعدد الحسابات - لا نعتبرها محاولة فاشلة
      const availableRoles = users.map(u => ({
        role: u.role,
        role_name: u.role === 'admin' ? 'مدير' : 'تاجر'
      }));

      return res.status(409).json({ 
        error: 'يوجد أكثر من حساب بهذا الاسم',
        message: 'يرجى تحديد نوع الحساب',
        available_roles: availableRoles,
        requires_role_selection: true,
        security_info: {
          type: 'multiple_accounts',
          current_attempts: attemptRecord?.failed_attempts || 0
        }
      });
    } else {
      user = users[0];
      isValidCredentials = await bcrypt.compare(password, user.password_hash);
    }

    // ===== الخطوة 4: معالجة المحاولة الفاشلة =====
    if (!isValidCredentials) {
      if (db.LoginAttempts) {
        try {
          const now = new Date();
          const newFailedAttempts = (attemptRecord?.failed_attempts || 0) + 1;
          const shouldLock = newFailedAttempts >= SECURITY_CONFIG.MAX_FAILED_ATTEMPTS;
          const lockedUntil = shouldLock ? new Date(now.getTime() + SECURITY_CONFIG.LOCKOUT_DURATION) : null;

          if (attemptRecord) {
            // تحديث السجل الموجود
            await attemptRecord.update({
              failed_attempts: newFailedAttempts,
              last_attempt: now,
              locked_until: lockedUntil,
              lock_reason: shouldLock ? 'max_attempts' : null,
              user_agent,
              ip_address
            });
          } else {
            // إنشاء سجل جديد
            await db.LoginAttempts.create({
              identifier,
              username,
              ip_address,
              user_agent,
              failed_attempts: newFailedAttempts,
              last_attempt: now,
              locked_until: lockedUntil,
              lock_reason: shouldLock ? 'max_attempts' : null,
              is_active: true
            });
          }

          const remainingAttempts = Math.max(0, SECURITY_CONFIG.MAX_FAILED_ATTEMPTS - newFailedAttempts);
          
          return res.status(401).json({ 
            error: 'اسم المستخدم أو كلمة المرور غير صحيحة',
            security_info: {
              type: 'invalid_credentials',
              failed_attempts: newFailedAttempts,
              remaining_attempts: remainingAttempts,
              max_attempts: SECURITY_CONFIG.MAX_FAILED_ATTEMPTS,
              warning: remainingAttempts <= 2 && remainingAttempts > 0 ? 
                `تبقى ${remainingAttempts} محاولة قبل حظر الحساب` : null,
              will_be_locked: shouldLock,
              locked_until: lockedUntil
            }
          });
        } catch (updateError) {
          console.error('خطأ في تحديث سجل المحاولات:', updateError);
        }
      }
      
      // في حالة عدم وجود نظام الأمان
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    // ===== الخطوة 5: نجح تسجيل الدخول - تنظيف السجلات =====
    if (db.LoginAttempts && attemptRecord) {
      try {
        await attemptRecord.update({
          failed_attempts: 0,
          locked_until: null,
          lock_reason: null,
          success_login_at: new Date(),
          unlock_method: 'successful_login'
        });
      } catch (cleanupError) {
        console.error('خطأ في تنظيف سجل المحاولات:', cleanupError);
      }
    }

    // ===== الخطوة 6: التحقق من تفعيل الحساب =====
    if (user.role === 'merchant' && user.whatsapp_number && !user.is_verified) {
      const hasActiveCode = whatsappService.verificationCodes && whatsappService.verificationCodes.has(user.user_id);
      
      return res.status(403).json({ 
        error: 'يجب تفعيل رقم الواتساب أولاً',
        requires_verification: true,
        user_id: user.user_id,
        whatsapp_number: user.whatsapp_number,
        has_active_code: hasActiveCode,
        message: hasActiveCode 
          ? 'يوجد رمز تحقق نشط. تحقق من الواتساب أو اطلب رمز جديد'
          : 'لا يوجد رمز تحقق نشط. اطلب رمز جديد'
      });
    }

    // ===== الخطوة 7: إنشاء التوكن والاستجابة =====
    const tokenPayload = {
      user_id: user.user_id,
      username: user.username,
      role: user.role,
      is_verified: user.is_verified
    };

    if (user.role === 'merchant' && user.Stores && user.Stores.length > 0) {
      tokenPayload.store_id = user.Stores[0].store_id;
    } else {
      tokenPayload.store_id = null;
    }

    const token = jwt.sign(tokenPayload, SECRET_KEY, { expiresIn: '24h' });
    const { password_hash: _, ...userWithoutPassword } = user.toJSON();

    const responseData = {
      message: `تم تسجيل الدخول بنجاح كـ${user.role === 'admin' ? 'مدير' : 'تاجر'}`,
      user: userWithoutPassword,
      token,
      security_info: {
        type: 'login_success',
        login_time: new Date().toISOString(),
        previous_failed_attempts: attemptRecord?.failed_attempts || 0
      }
    };

    if (user.role === 'merchant' && user.Stores && user.Stores.length > 0) {
      responseData.user.store = {
        store_id: user.Stores[0].store_id,
        store_name: user.Stores[0].store_name
      };
    }

    res.status(200).json(responseData);

  } catch (error) {
    console.error('Error in login:', error);
    res.status(500).json({ 
      error: 'حدث خطأ في السيرفر',
      security_info: { type: 'server_error' }
    });
  }
};

// إرسال رمز التحقق (مع منع الإرسال المتكرر)
exports.sendVerificationCode = async (req, res) => {
  try {
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'معرف المستخدم مطلوب' });
    }

    const user = await db.User.findByPk(user_id);
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    if (!user.whatsapp_number) {
      return res.status(400).json({ error: 'لا يوجد رقم واتساب مرتبط بهذا الحساب' });
    }

    if (user.is_verified) {
      return res.status(400).json({ error: 'الحساب مفعل بالفعل' });
    }

    // التحقق من وجود رمز نشط
    const existingCode = whatsappService.verificationCodes.get(user_id);
    if (existingCode) {
      const timeLeft = Math.max(0, Math.floor((existingCode.expires - Date.now()) / 1000));
      
      // السماح بإعادة الإرسال إذا بقي أقل من دقيقتين
      if (timeLeft > 120) {
        return res.status(429).json({
          error: `يوجد رمز نشط. يمكنك طلب رمز جديد بعد ${Math.floor(timeLeft / 60)} دقيقة و ${timeLeft % 60} ثانية`,
          time_left: timeLeft,
          can_resend_at: new Date(Date.now() + (timeLeft - 120) * 1000)
        });
      }
    }

    // إرسال رمز التحقق
    const result = await whatsappService.sendVerificationCode(user.whatsapp_number, user.user_id);

    res.status(200).json({
      message: 'تم إرسال رمز التحقق بنجاح إلى الواتساب',
      success: true,
      phone_number: user.whatsapp_number,
      expires_in: 300, // 5 دقائق
      can_resend_after: 120 // يمكن إعادة الإرسال بعد دقيقتين
    });

  } catch (error) {
    console.error('خطأ في إرسال رمز التحقق:', error);
    res.status(500).json({
      error: error.message || 'فشل في إرسال رمز التحقق'
    });
  }
};

// التحقق من رمز التحقق
exports.verifyWhatsAppCode = async (req, res) => {
  try {
    const { user_id, verification_code } = req.body;

    if (!user_id || !verification_code) {
      return res.status(400).json({
        error: 'معرف المستخدم ورمز التحقق مطلوبان'
      });
    }

    const user = await db.User.findByPk(user_id);
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    if (user.is_verified) {
      return res.status(400).json({ error: 'الحساب مفعل بالفعل' });
    }

    const verificationResult = whatsappService.verifyCode(user_id, verification_code);

    if (!verificationResult.success) {
      return res.status(400).json({
        error: verificationResult.message,
        can_request_new: true
      });
    }

    // تحديث حالة المستخدم إلى مفعل
    await user.update({ is_verified: true });

    // إنشاء توكن جديد
    const tokenPayload = {
      user_id: user.user_id,
      username: user.username,
      role: user.role,
      is_verified: true
    };

    const token = jwt.sign(tokenPayload, SECRET_KEY, { expiresIn: '24h' });

    res.status(200).json({
      message: 'تم تفعيل رقم الهاتف بنجاح',
      verified: true,
      token: token,
      user: {
        user_id: user.user_id,
        username: user.username,
        is_verified: true
      }
    });

  } catch (error) {
    console.error('خطأ في التحقق:', error);
    res.status(500).json({
      error: 'حدث خطأ في السيرفر'
    });
  }
};

// الحصول على حالة التفعيل
exports.getVerificationStatus = async (req, res) => {
  try {
    const { user_id } = req.params;

    const user = await db.User.findByPk(user_id, {
      attributes: ['user_id', 'username', 'whatsapp_number', 'is_verified']
    });

    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    // التحقق من وجود رمز نشط
    const activeCode = whatsappService.verificationCodes.get(parseInt(user_id));
    let codeInfo = null;
    
    if (activeCode) {
      const timeLeft = Math.max(0, Math.floor((activeCode.expires - Date.now()) / 1000));
      codeInfo = {
        has_active_code: true,
        time_left: timeLeft,
        expires_at: new Date(activeCode.expires),
        can_resend: timeLeft <= 120 // يمكن إعادة الإرسال إذا بقي أقل من دقيقتين
      };
    }

    res.status(200).json({
      user_id: user.user_id,
      username: user.username,
      whatsapp_number: user.whatsapp_number,
      is_verified: user.is_verified,
      has_whatsapp: !!user.whatsapp_number,
      verification_code_info: codeInfo,
      next_action: user.is_verified 
        ? 'login' 
        : (codeInfo?.has_active_code ? 'enter_code' : 'request_code')
    });

  } catch (error) {
    console.error('خطأ في الحصول على حالة التفعيل:', error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// إعادة إرسال رمز التحقق (endpoint منفصل للوضوح)
exports.resendVerificationCode = async (req, res) => {
  try {
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'معرف المستخدم مطلوب' });
    }

    const user = await db.User.findByPk(user_id);
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    if (user.is_verified) {
      return res.status(400).json({ error: 'الحساب مفعل بالفعل' });
    }

    // حذف الرمز القديم إن وجد
    whatsappService.verificationCodes.delete(user_id);

    // إرسال رمز جديد
    const result = await whatsappService.sendVerificationCode(user.whatsapp_number, user.user_id);

    res.status(200).json({
      message: 'تم إعادة إرسال رمز التحقق بنجاح',
      success: true,
      phone_number: user.whatsapp_number,
      expires_in: 300
    });

  } catch (error) {
    console.error('خطأ في إعادة إرسال رمز التحقق:', error);
    res.status(500).json({
      error: error.message || 'فشل في إعادة إرسال رمز التحقق'
    });
  }
};

// باقي التوابع الموجودة... (getAllUsers, getUserById, etc.)

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

exports.requestPasswordReset = async (req, res) => {
  try {
    const { username } = req.body;

    // التحقق من البيانات المطلوبة
    if (!username) {
      return res.status(400).json({ 
        error: 'اسم المستخدم مطلوب' 
      });
    }

    // البحث عن المستخدم
    const user = await db.User.findOne({ where: { username } });
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    // التحقق من وجود رقم واتساب
    if (!user.whatsapp_number) {
      return res.status(400).json({ error: 'لا يوجد رقم واتساب مرتبط بهذا الحساب' });
    }

    // التحقق من وجود رمز نشط لإعادة تعيين كلمة المرور
    const existingCode = whatsappService.verificationCodes.get(`reset_${user.user_id}`);
    if (existingCode) {
      const timeLeft = Math.max(0, Math.floor((existingCode.expires - Date.now()) / 1000));
      
      // السماح بإعادة الإرسال إذا بقي أقل من دقيقتين
      if (timeLeft > 120) {
        return res.status(429).json({
          error: `يوجد رمز نشط. يمكنك طلب رمز جديد بعد ${Math.floor(timeLeft / 60)} دقيقة و ${timeLeft % 60} ثانية`,
          time_left: timeLeft,
          can_resend_at: new Date(Date.now() + (timeLeft - 120) * 1000)
        });
      }
    }

    // إرسال رمز التحقق مع معرف خاص لإعادة تعيين كلمة المرور
    const result = await whatsappService.sendVerificationCode(user.whatsapp_number, `reset_${user.user_id}`);

    res.status(200).json({
      message: 'تم إرسال رمز إعادة تعيين كلمة المرور بنجاح إلى الواتساب',
      success: true,
      phone_number: user.whatsapp_number,
      user_id: user.user_id, // نحتاج هذا للمرحلة التالية
      expires_in: 300, // 5 دقائق
      can_resend_after: 120, // يمكن إعادة الإرسال بعد دقيقتين
      next_step: 'verify_and_reset_password'
    });

  } catch (error) {
    console.error('خطأ في طلب إعادة تعيين كلمة السر:', error);
    res.status(500).json({
      error: error.message || 'فشل في إرسال رمز التحقق'
    });
  }
};

// المرحلة الثانية: التحقق من الرمز وتعيين كلمة المرور الجديدة
exports.verifyAndResetPassword = async (req, res) => {
  try {
    const { username, verification_code, new_password, confirm_password } = req.body;

    // التحقق من البيانات المطلوبة
    if (!username || !verification_code || !new_password || !confirm_password) {
      return res.status(400).json({ 
        error: 'اسم المستخدم ورمز التحقق وكلمة المرور الجديدة وتأكيدها مطلوبة' 
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

    // البحث عن المستخدم باستخدام اسم المستخدم
    const user = await db.User.findOne({ where: { username } });
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    // التحقق من رمز التحقق باستخدام user_id المستخرج من قاعدة البيانات
    const verificationResult = whatsappService.verifyCode(`reset_${user.user_id}`, verification_code);

    if (!verificationResult.success) {
      return res.status(400).json({
        error: verificationResult.message,
        can_request_new: true
      });
    }

    // تشفير كلمة المرور الجديدة
    const saltRounds = 10;
    const new_password_hash = await bcrypt.hash(new_password, saltRounds);

    // تحديث كلمة المرور
    await user.update({ password_hash: new_password_hash });

    // إنشاء توكن جديد للمستخدم (تسجيل دخول تلقائي)
    const tokenPayload = {
      user_id: user.user_id,
      username: user.username,
      role: user.role,
      is_verified: user.is_verified
    };

    const token = jwt.sign(tokenPayload, SECRET_KEY, { expiresIn: '24h' });

    res.status(200).json({
      message: 'تم إعادة تعيين كلمة المرور بنجاح',
      success: true,
      timestamp: new Date(),
      token: token, // تسجيل دخول تلقائي
      user: {
        user_id: user.user_id,
        username: user.username,
        role: user.role,
        is_verified: user.is_verified
      }
    });

  } catch (error) {
    console.error('خطأ في إعادة تعيين كلمة المرور:', error);
    res.status(500).json({
      error: 'حدث خطأ في السيرفر'
    });
  }
};
// تابع مساعد لإعادة إرسال رمز التحقق لإعادة تعيين كلمة السر
exports.resendPasswordResetCode = async (req, res) => {
  try {
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'معرف المستخدم مطلوب' });
    }

    const user = await db.User.findByPk(user_id);
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    if (!user.whatsapp_number) {
      return res.status(400).json({ error: 'لا يوجد رقم واتساب مرتبط بهذا الحساب' });
    }

    // التحقق من وجود رمز نشط
    const existingCode = whatsappService.verificationCodes.get(`reset_${user.user_id}`);
    if (existingCode) {
      const timeLeft = Math.max(0, Math.floor((existingCode.expires - Date.now()) / 1000));
      
      if (timeLeft > 120) {
        return res.status(429).json({
          error: `يمكنك طلب رمز جديد بعد ${Math.floor(timeLeft / 60)} دقيقة و ${timeLeft % 60} ثانية`,
          time_left: timeLeft
        });
      }
    }

    // إرسال رمز التحقق الجديد
    const result = await whatsappService.sendVerificationCode(user.whatsapp_number, `reset_${user.user_id}`);

    res.status(200).json({
      message: 'تم إعادة إرسال رمز التحقق بنجاح',
      success: true,
      phone_number: user.whatsapp_number,
      expires_in: 300
    });

  } catch (error) {
    console.error('خطأ في إعادة إرسال رمز التحقق:', error);
    res.status(500).json({
      error: error.message || 'فشل في إعادة إرسال رمز التحقق'
    });
  }
};

// تابع للتحقق من صحة اسم المستخدم (اختياري - لمساعدة المستخدم)
exports.checkUsername = async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'اسم المستخدم مطلوب' });
    }

    const user = await db.User.findOne({ 
      where: { username },
      attributes: ['user_id', 'username', 'whatsapp_number'] // لا نرجع معلومات حساسة
    });

    if (!user) {
      return res.status(404).json({ 
        error: 'اسم المستخدم غير موجود',
        valid: false 
      });
    }

    if (!user.whatsapp_number) {
      return res.status(400).json({ 
        error: 'لا يوجد رقم واتساب مرتبط بهذا الحساب',
        valid: false 
      });
    }

    // إخفاء جزء من رقم الهاتف لأسباب الخصوصية
    const maskedPhone = user.whatsapp_number.replace(/(\d{2})\d+(\d{2})/, '$1****$2');

    res.status(200).json({
      message: 'اسم المستخدم صحيح',
      valid: true,
      user_id: user.user_id,
      masked_phone: maskedPhone
    });

  } catch (error) {
    console.error('خطأ في التحقق من اسم المستخدم:', error);
    res.status(500).json({
      error: 'حدث خطأ في السيرفر'
    });
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

    // === إحصائيات المستخدمين ===
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

    const usersWithStores = await db.User.count({
      include: [
        {
          model: db.Store,
          required: true
        }
      ]
    });

    // === إحصائيات الطلبات والإيرادات ===
    
    // إجمالي عدد الطلبات في الموقع
    const totalOrders = await db.Order.count();

    // إجمالي الطلبات المكتملة فقط (للإيرادات الصحيحة)
    const completedOrders = await db.Order.count({
      where: {
        status: {
          [db.Sequelize.Op.in]: ['completed', 'delivered', 'confirmed']
        }
      }
    });

    // إجمالي الطلبات المعلقة
    const pendingOrders = await db.Order.count({
      where: {
        status: 'pending'
      }
    });

    // إجمالي الطلبات الملغية
    const cancelledOrders = await db.Order.count({
      where: {
        status: {
          [db.Sequelize.Op.in]: ['cancelled', 'refunded']
        }
      }
    });

    // إجمالي الإيرادات من الطلبات المكتملة
    const totalRevenueResult = await db.Order.findOne({
      where: {
        status: {
          [db.Sequelize.Op.in]: ['completed', 'delivered', 'confirmed']
        }
      },
      attributes: [
        [db.Sequelize.fn('SUM', db.Sequelize.col('total_price')), 'totalRevenue']
      ],
      raw: true
    });

    const totalRevenue = totalRevenueResult?.totalRevenue || 0;

    // إيرادات هذا الشهر
    const monthlyRevenueResult = await db.Order.findOne({
      where: {
        status: {
          [db.Sequelize.Op.in]: ['completed', 'delivered', 'confirmed']
        },
        created_at: {
          [db.Sequelize.Op.gte]: currentMonth
        }
      },
      attributes: [
        [db.Sequelize.fn('SUM', db.Sequelize.col('total_price')), 'monthlyRevenue']
      ],
      raw: true
    });

    const monthlyRevenue = monthlyRevenueResult?.monthlyRevenue || 0;

    // === إحصائيات المنتجات ===
    const totalProducts = await db.Product.count();

    // المنتجات الجديدة هذا الشهر
    const newProductsThisMonth = await db.Product.count({
      where: {
        created_at: {
          [db.Sequelize.Op.gte]: currentMonth
        }
      }
    });

    // المنتجات منخفضة المخزون (أقل من 10)
    const lowStockProducts = await db.Product.count({
      where: {
        stock_quantity: {
          [db.Sequelize.Op.lt]: 10
        }
      }
    });

    // المنتجات نفذت من المخزون
    const outOfStockProducts = await db.Product.count({
      where: {
        stock_quantity: 0
      }
    });

    // === إحصائيات العملاء ===
    // عدد العملاء الفريدين الذين قاموا بطلبات (من purchase_id)
    const uniqueCustomersResult = await db.Order.findAll({
      where: {
        purchase_id: {
          [db.Sequelize.Op.not]: null
        }
      },
      attributes: [
        [db.Sequelize.fn('DISTINCT', db.Sequelize.col('customer_session_id')), 'customer_session_id']
      ],
      raw: true
    });

    const totalCustomers = uniqueCustomersResult.length;

    // عدد العملاء الجدد هذا الشهر
    const newCustomersThisMonth = await db.Order.findAll({
      where: {
        purchase_id: {
          [db.Sequelize.Op.not]: null
        },
        created_at: {
          [db.Sequelize.Op.gte]: currentMonth
        }
      },
      attributes: [
        [db.Sequelize.fn('DISTINCT', db.Sequelize.col('customer_session_id')), 'customer_session_id']
      ],
      raw: true
    });

    const monthlyNewCustomers = newCustomersThisMonth.length;

    // === إحصائيات التسوية المالية ===
    const pendingSettlements = await db.Order.count({
      where: {
        settlement_status: 'settlement_requested'
      }
    });

    const settledOrders = await db.Order.count({
      where: {
        settlement_status: 'settled'
      }
    });

    // === إحصائيات التقييمات ===
    const totalReviews = await db.Review.count();
    const verifiedReviews = await db.Review.count({
      where: { is_verified: true }
    });
    const pendingReviews = await db.Review.count({
      where: { is_verified: false }
    });

    // === إحصائيات إضافية مفيدة ===
    
    // متوسط قيمة الطلب
    const averageOrderValue = totalRevenue && completedOrders > 0 
      ? parseFloat((totalRevenue / completedOrders).toFixed(2))
      : 0;

    // متوسط عدد الطلبات لكل عميل
    const averageOrdersPerCustomer = totalCustomers > 0 
      ? parseFloat((completedOrders / totalCustomers).toFixed(2))
      : 0;

    // === تجميع النتائج ===
    const stats = {
      // إحصائيات المستخدمين
      users: {
        total: totalUsers,
        merchants: totalMerchants,
        admins: totalAdmins,
        newThisMonth: newUsersThisMonth,
        withStores: usersWithStores
      },
      
      // إحصائيات المتاجر
      stores: {
        total: totalStores
      },
      
      // إحصائيات الطلبات
      orders: {
        total: totalOrders,
        completed: completedOrders,
        pending: pendingOrders,
        cancelled: cancelledOrders
      },
      
      // إحصائيات الإيرادات
      revenue: {
        total: parseFloat(totalRevenue).toFixed(2),
        monthly: parseFloat(monthlyRevenue).toFixed(2),
        averageOrderValue: averageOrderValue
      },
      
      // إحصائيات المنتجات
      products: {
        total: totalProducts,
        newThisMonth: newProductsThisMonth,
        lowStock: lowStockProducts,
        outOfStock: outOfStockProducts
      },
      
      // إحصائيات العملاء
      customers: {
        total: totalCustomers,
        newThisMonth: monthlyNewCustomers,
        averageOrdersPerCustomer: averageOrdersPerCustomer
      },
      
      // إحصائيات التسوية المالية
      settlements: {
        pending: pendingSettlements,
        completed: settledOrders
      },
      
      // إحصائيات التقييمات
      reviews: {
        total: totalReviews,
        verified: verifiedReviews,
        pending: pendingReviews
      },
      
      // معلومات إضافية مفيدة للداشبورد
      summary: {
        totalSiteRevenue: parseFloat(totalRevenue).toFixed(2),
        totalSiteOrders: totalOrders,
        totalSiteProducts: totalProducts,
        totalSiteCustomers: totalCustomers,
        monthlyGrowth: {
          newUsers: newUsersThisMonth,
          newProducts: newProductsThisMonth,
          newCustomers: monthlyNewCustomers,
          revenue: parseFloat(monthlyRevenue).toFixed(2)
        }
      }
    };

    res.status(200).json({
      success: true,
      message: 'تم جلب الإحصائيات بنجاح',
      data: stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in getUsersStats:', error);
    res.status(500).json({ 
      success: false,
      error: 'حدث خطأ في السيرفر',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};