
// الملف الكامل سيكون كالتالي:
const express = require('express');
const router = express.Router();
const userController = require('../controllers/UserController');
const authMiddleware = require('../middleware/authMiddleware');
const { validateWhatsAppNumber, checkWhatsAppStatus, requireVerification } = require('../middleware/whatsappMiddleware');

// المسارات العامة (لا تحتاج مصادقة)
router.post('/register', validateWhatsAppNumber, userController.register);
router.post('/login', userController.login);

// ===== مسارات نسيت كلمة المرور (لا تحتاج مصادقة) =====
// المرحلة الأولى: طلب إعادة تعيين كلمة المرور
router.post('/forgot-password', userController.requestPasswordReset);

// المرحلة الثانية: التحقق من الرمز وإعادة تعيين كلمة المرور
router.post('/reset-password', userController.verifyAndResetPassword);

// إعادة إرسال رمز التحقق لإعادة تعيين كلمة السر
router.post('/resend-reset-code', userController.resendPasswordResetCode);

router.post('/change-password', authMiddleware, userController.changePassword);

// التحقق من صحة اسم المستخدم (اختياري)
router.post('/check-username', userController.checkUsername);

// مسارات التحقق من WhatsApp
router.post('/send-verification', checkWhatsAppStatus, userController.sendVerificationCode);
router.post('/verify-whatsapp', userController.verifyWhatsAppCode);
router.get('/verification-status/:user_id', userController.getVerificationStatus);
router.post('/resend-verification', userController.resendVerificationCode);

// المسارات التي تحتاج مصادقة
router.get('/profile', authMiddleware, userController.getProfile);
router.get('/verify-token', authMiddleware, userController.verifyToken);

// تغيير كلمة السر للمستخدمين المسجلين دخولهم (يحتاج كلمة المرور الحالية)

// مسار الإحصائيات (للمدراء فقط)
router.get('/admin/stats', authMiddleware, requireVerification, userController.getUsersStats);

// المسارات التي تحتاج مصادقة وتفعيل
router.get('/', authMiddleware, requireVerification, userController.getAllUsers);
router.get('/:id', authMiddleware, requireVerification, userController.getUserById);
router.put('/:id', authMiddleware, requireVerification, validateWhatsAppNumber, userController.updateUser);
router.delete('/:id', authMiddleware, requireVerification, userController.deleteUser);

module.exports = router;