const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

class OptimizedWhatsAppService {
  constructor() {
    this.client = null;
    this.isReady = false;
    this.verificationCodes = new Map();
    this.qrCodeGenerated = false;
    this.sentMessages = [];
    this.isInitializing = false;
  }

  // تشغيل خدمة WhatsApp بشكل آمن
  async initialize() {
    if (this.isInitializing) {
      console.log('WhatsApp is already initializing...');
      return;
    }

    this.isInitializing = true;

    try {
      console.log('📱 Starting WhatsApp service...');

      this.client = new Client({
        authStrategy: new LocalAuth({
          clientId: "whatsapp-session",
          dataPath: './.wwebjs_auth'
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-extensions',
            '--disable-plugins',
            '--disable-images',
            '--disable-javascript',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor'
          ],
          timeout: 60000 // 60 ثانية timeout
        }
      });

      // إعداد مستمعي الأحداث
      this.setupEventListeners();

      // بدء التشغيل مع timeout
      const initPromise = this.client.initialize();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('WhatsApp initialization timeout')), 90000); // 90 ثانية
      });

      await Promise.race([initPromise, timeoutPromise]);
      
      console.log('✅ WhatsApp client started successfully');
      
    } catch (error) {
      console.error('❌ WhatsApp initialization failed:', error.message);
      this.isReady = false;
      this.isInitializing = false;
      
      // تنظيف في حالة الفشل
      if (this.client) {
        try {
          await this.client.destroy();
        } catch (destroyError) {
          console.error('Error destroying client:', destroyError.message);
        }
        this.client = null;
      }
      
      // لا تتوقف الخادم في حالة فشل WhatsApp
      console.log('⚠️ WhatsApp service disabled. Server will continue without WhatsApp features.');
    } finally {
      this.isInitializing = false;
    }
  }

  setupEventListeners() {
    // QR Code
    this.client.on('qr', (qr) => {
      this.qrCodeGenerated = true;
      console.log('\n📱 ═══════════════════════════════════════');
      console.log('   WhatsApp QR Code - امسح بهاتفك');
      console.log('═══════════════════════════════════════');
      qrcode.generate(qr, { small: true });
      console.log('═══════════════════════════════════════');
      console.log('📱 افتح WhatsApp في هاتفك');
      console.log('📷 اذهب إلى الإعدادات > الأجهزة المتصلة');
      console.log('📲 امسح الكود أعلاه');
      console.log('⏳ انتظر رسالة "WhatsApp Client is ready!"');
      console.log('═══════════════════════════════════════\n');
    });

    // جاهز
    this.client.on('ready', () => {
      console.log('\n🎉 ═══════════════════════════════════════');
      console.log('   WhatsApp Client is ready!');
      console.log('   الآن يمكن إرسال رسائل التحقق الحقيقية');
      console.log('═══════════════════════════════════════\n');
      this.isReady = true;
      this.qrCodeGenerated = false;
      this.isInitializing = false;
    });

    // انقطاع الاتصال
    this.client.on('disconnected', (reason) => {
      console.log('❌ WhatsApp Client disconnected:', reason);
      this.isReady = false;
      this.qrCodeGenerated = false;
      this.isInitializing = false;
    });

    // فشل المصادقة
    this.client.on('auth_failure', (msg) => {
      console.log('❌ WhatsApp authentication failed:', msg);
      this.isReady = false;
      this.qrCodeGenerated = false;
      this.isInitializing = false;
    });

    // التحميل
    this.client.on('loading_screen', (percent, message) => {
      console.log(`⏳ Loading WhatsApp: ${percent}% - ${message}`);
    });

    // الأخطاء
    this.client.on('error', (error) => {
      console.error('WhatsApp Client Error:', error.message);
    });
  }

  // توليد رمز تحقق
  generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // إرسال رمز التحقق
  async sendVerificationCode(phoneNumber, userId) {
    if (!this.isReady) {
      throw new Error('خدمة WhatsApp غير متصلة. تأكد من مسح QR Code أولاً');
    }

    try {
      const formattedNumber = this.formatPhoneNumber(phoneNumber);
      const code = this.generateVerificationCode();
      
      // حفظ الرمز
      this.verificationCodes.set(userId, {
        code: code,
        expires: Date.now() + 5 * 60 * 1000,
        phoneNumber: phoneNumber,
        attempts: 0
      });

      // إعداد الرسالة
      const message = `🔐 *رمز التحقق الخاص بك*

الرمز: *${code}*

⏰ صالح لمدة 5 دقائق فقط
🔒 لا تشارك هذا الرمز مع أحد

شكراً لاستخدام خدماتنا 🌟`;

      const numberId = `${formattedNumber}@c.us`;

      // إرسال الرسالة مع معالجة الأخطاء
      try {
        await this.client.sendMessage(numberId, message);
        
        // حفظ الرسالة
        this.sentMessages.push({
          to: formattedNumber,
          message: message,
          code: code,
          timestamp: new Date(),
          userId: userId,
          type: 'verification'
        });
        
        console.log(`✅ تم إرسال رمز التحقق ${code} إلى ${phoneNumber}`);
        
        return { 
          success: true, 
          message: 'تم إرسال رمز التحقق بنجاح',
          phoneNumber: formattedNumber
        };

      } catch (sendError) {
        console.error('❌ خطأ في إرسال الرسالة:', sendError.message);
        
        if (sendError.message.includes('number not registered')) {
          throw new Error(`الرقم ${phoneNumber} غير مسجل في WhatsApp`);
        } else if (sendError.message.includes('Rate limit')) {
          throw new Error('تم إرسال رسائل كثيرة. يرجى الانتظار');
        } else {
          throw new Error(`فشل في إرسال رمز التحقق: ${sendError.message}`);
        }
      }

    } catch (error) {
      console.error('❌ خطأ عام في إرسال رمز التحقق:', error);
      throw error;
    }
  }

  // التحقق من رمز التحقق
  verifyCode(userId, inputCode) {
    const storedData = this.verificationCodes.get(userId);
    
    if (!storedData) {
      return { success: false, message: 'لم يتم العثور على رمز التحقق' };
    }

    storedData.attempts += 1;

    if (Date.now() > storedData.expires) {
      this.verificationCodes.delete(userId);
      return { success: false, message: 'انتهت صلاحية رمز التحقق' };
    }

    if (storedData.attempts > 3) {
      this.verificationCodes.delete(userId);
      return { success: false, message: 'تم تجاوز عدد المحاولات المسموحة' };
    }

    if (storedData.code !== inputCode) {
      return { 
        success: false, 
        message: `رمز التحقق غير صحيح. المحاولات المتبقية: ${3 - storedData.attempts}` 
      };
    }

    this.verificationCodes.delete(userId);
    console.log(`✅ تم التحقق بنجاح للمستخدم ${userId}`);
    return { success: true, message: 'تم التحقق بنجاح' };
  }

  // تنسيق رقم الهاتف
  formatPhoneNumber(phoneNumber) {
  let formatted = phoneNumber.replace(/\D/g, '');
  
  // إزالة رمز الدولة 966 إن وجد
  if (formatted.startsWith('966')) {
    formatted = formatted.substring(3);
  }
  
  return formatted;
}

  // باقي التوابع المطلوبة للتوافق مع app.js
  cleanExpiredCodes() {
    const now = Date.now();
    let cleanedCount = 0;
    for (const [userId, data] of this.verificationCodes.entries()) {
      if (now > data.expires) {
        this.verificationCodes.delete(userId);
        cleanedCount++;
      }
    }
    return cleanedCount;
  }

  getStats() {
    return {
      isReady: this.isReady,
      qrCodeGenerated: this.qrCodeGenerated,
      activeVerifications: this.verificationCodes.size,
      totalMessagesSent: this.sentMessages.length,
      verificationsList: Array.from(this.verificationCodes.entries()).map(([userId, data]) => ({
        userId,
        phoneNumber: data.phoneNumber,
        code: data.code,
        expiresIn: Math.max(0, Math.floor((data.expires - Date.now()) / 1000)),
        attempts: data.attempts
      }))
    };
  }

  getSentMessages(limit = 10) {
    return this.sentMessages
      .slice(-limit)
      .reverse()
      .map(msg => ({
        to: msg.to,
        code: msg.code,
        timestamp: msg.timestamp,
        userId: msg.userId,
        type: msg.type
      }));
  }

  setCustomVerificationCode(userId, code, phoneNumber) {
    this.verificationCodes.set(userId, {
      code: code,
      expires: Date.now() + 5 * 60 * 1000,
      phoneNumber: phoneNumber,
      attempts: 0
    });
    return { success: true, code: code };
  }

  clearAllCodes() {
    const count = this.verificationCodes.size;
    this.verificationCodes.clear();
    return count;
  }

  async restart() {
    try {
      if (this.client) {
        await this.client.destroy();
      }
      this.isReady = false;
      this.qrCodeGenerated = false;
      this.isInitializing = false;
      await this.initialize();
      return { success: true, message: 'تم إعادة تشغيل الخدمة' };
    } catch (error) {
      console.error('Error restarting WhatsApp:', error);
      return { success: false, error: error.message };
    }
  }

  async sendMessage(phoneNumber, message) {
    if (!this.isReady) {
      throw new Error('خدمة WhatsApp غير متصلة');
    }

    try {
      const formattedNumber = this.formatPhoneNumber(phoneNumber);
      const numberId = `${formattedNumber}@c.us`;
      
      await this.client.sendMessage(numberId, message);
      
      this.sentMessages.push({
        to: formattedNumber,
        message: message,
        timestamp: new Date(),
        type: 'general'
      });
      
      return { success: true, message: 'تم إرسال الرسالة' };
    } catch (error) {
      throw error;
    }
  }

  // تنظيف آمن عند الإغلاق
  async cleanup() {
    try {
      if (this.client) {
        await this.client.destroy();
        this.client = null;
      }
      this.isReady = false;
      this.isInitializing = false;
      console.log('✅ WhatsApp service cleaned up');
    } catch (error) {
      console.error('Error cleaning up WhatsApp service:', error);
    }
  }
}

module.exports = new OptimizedWhatsAppService();