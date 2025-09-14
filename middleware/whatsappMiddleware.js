const whatsappService = require('../config/whatsapp');

// Middleware للتحقق من أن رقم الواتساب صحيح
const validateWhatsAppNumber = (req, res, next) => {
  const { whatsapp_number } = req.body;
  
  if (whatsapp_number) {
    // التحقق من تنسيق الرقم
    const phoneRegex = /^[0-9+\-\s()]+$/;
    if (!phoneRegex.test(whatsapp_number)) {
      return res.status(400).json({
        error: 'تنسيق رقم الواتساب غير صحيح'
      });
    }

    // التحقق من طول الرقم
    const cleanNumber = whatsapp_number.replace(/\D/g, '');
    if (cleanNumber.length < 9 || cleanNumber.length > 15) {
      return res.status(400).json({
        error: 'رقم الواتساب يجب أن يكون بين 9 و 15 رقم'
      });
    }
  }

  next();
};

// Middleware للتحقق من حالة WhatsApp
const checkWhatsAppStatus = (req, res, next) => {
  if (!whatsappService.isReady) {
    return res.status(503).json({
      error: 'خدمة WhatsApp غير متاحة حالياً. يرجى المحاولة لاحقاً.',
      whatsapp_status: 'disconnected'
    });
  }
  next();
};

// Middleware للتحقق من التفعيل للمستخدمين المفعلين فقط
const requireVerification = (req, res, next) => {
  if (req.user && !req.user.is_verified) {
    return res.status(403).json({
      error: 'يجب تفعيل حسابك أولاً',
      requires_verification: true,
      user_id: req.user.user_id
    });
  }
  next();
};

// Middleware لمنع spam في إرسال رموز التحقق
const rateLimitVerification = (req, res, next) => {
  const { user_id } = req.body;
  
  if (!user_id) {
    return res.status(400).json({
      error: 'معرف المستخدم مطلوب'
    });
  }

  // التحقق من وجود رمز تحقق نشط
  const existingCode = whatsappService.verificationCodes.get(parseInt(user_id));
  if (existingCode) {
    const timeLeft = Math.max(0, Math.floor((existingCode.expires - Date.now()) / 1000));
    if (timeLeft > 240) { // 4 دقائق باقية
      return res.status(429).json({
        error: `يرجى الانتظار ${Math.floor(timeLeft / 60)} دقيقة و ${timeLeft % 60} ثانية قبل طلب رمز جديد`,
        time_left: timeLeft
      });
    }
  }

  next();
};

module.exports = {
  validateWhatsAppNumber,
  checkWhatsAppStatus,
  requireVerification,
  rateLimitVerification
};