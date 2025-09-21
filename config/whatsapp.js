const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// خريطة رموز الدول حسب بداية الرقم
const COUNTRY_CODES = {
  // السعودية
  '05': { country: 'السعودية', code: '966', pattern: /^0[5]\d{8}$/ },
  
  // سوريا
  '099': { country: 'سوريا', code: '963', pattern: /^0[9][9]\d{7}$/ },
  '098': { country: 'سوريا', code: '963', pattern: /^0[9][8]\d{7}$/ },
  '097': { country: 'سوريا', code: '963', pattern: /^0[9][7]\d{7}$/ },
  '096': { country: 'سوريا', code: '963', pattern: /^0[9][6]\d{7}$/ },
  '095': { country: 'سوريا', code: '963', pattern: /^0[9][5]\d{7}$/ },
  '094': { country: 'سوريا', code: '963', pattern: /^0[9][4]\d{7}$/ },
  '093': { country: 'سوريا', code: '963', pattern: /^0[9][3]\d{7}$/ },
  '092': { country: 'سوريا', code: '963', pattern: /^0[9][12]\d{7}$/ },
  
  // الإمارات
  '050': { country: 'الإمارات', code: '971', pattern: /^0[5][0]\d{7}$/ },
  '052': { country: 'الإمارات', code: '971', pattern: /^0[5][2]\d{7}$/ },
  '055': { country: 'الإمارات', code: '971', pattern: /^0[5][5]\d{7}$/ },
  '056': { country: 'الإمارات', code: '971', pattern: /^0[5][6]\d{7}$/ },
  
  // مصر
  '010': { country: 'مصر', code: '20', pattern: /^0[1][0]\d{8}$/ },
  '011': { country: 'مصر', code: '20', pattern: /^0[1][1]\d{8}$/ },
  '012': { country: 'مصر', code: '20', pattern: /^0[1][2]\d{8}$/ },
  '015': { country: 'مصر', code: '20', pattern: /^0[1][5]\d{8}$/ },
  
  // الأردن
  '077': { country: 'الأردن', code: '962', pattern: /^0[7][7-9]\d{7}$/ },
  '078': { country: 'الأردن', code: '962', pattern: /^0[7][7-9]\d{7}$/ },
  '079': { country: 'الأردن', code: '962', pattern: /^0[7][7-9]\d{7}$/ },
  
  // لبنان
  '070': { country: 'لبنان', code: '961', pattern: /^0[7][0-9]\d{6}$/ },
  '071': { country: 'لبنان', code: '961', pattern: /^0[7][0-9]\d{6}$/ },
  '076': { country: 'لبنان', code: '961', pattern: /^0[7][0-9]\d{6}$/ },
  '081': { country: 'لبنان', code: '961', pattern: /^0[8][1]\d{6}$/ },
  
  // العراق
  '077': { country: 'العراق', code: '964', pattern: /^0[7][7-9]\d{8}$/ },
  '078': { country: 'العراق', code: '964', pattern: /^0[7][7-9]\d{8}$/ },
  '079': { country: 'العراق', code: '964', pattern: /^0[7][7-9]\d{8}$/ },
  
  // فلسطين
  '059': { country: 'فلسطين', code: '970', pattern: /^0[5][9]\d{7}$/ },
  '056': { country: 'فلسطين', code: '970', pattern: /^0[5][6]\d{7}$/ },
  
  // الكويت
  '065': { country: 'الكويت', code: '965', pattern: /^0[6][5-9]\d{7}$/ },
  '066': { country: 'الكويت', code: '965', pattern: /^0[6][5-9]\d{7}$/ },
  '067': { country: 'الكويت', code: '965', pattern: /^0[6][5-9]\d{7}$/ },
  '069': { country: 'الكويت', code: '965', pattern: /^0[6][5-9]\d{7}$/ },
  
  // قطر
  '033': { country: 'قطر', code: '974', pattern: /^0[3][3-9]\d{7}$/ },
  '055': { country: 'قطر', code: '974', pattern: /^0[5][5-9]\d{7}$/ },
  '066': { country: 'قطر', code: '974', pattern: /^0[6][6-9]\d{7}$/ },
  '077': { country: 'قطر', code: '974', pattern: /^0[7][7-9]\d{7}$/ },
  
  // البحرين
  '033': { country: 'البحرين', code: '973', pattern: /^0[3][3-9]\d{7}$/ },
  '066': { country: 'البحرين', code: '973', pattern: /^0[6][6-9]\d{7}$/ },
  '077': { country: 'البحرين', code: '973', pattern: /^0[7][7-9]\d{7}$/ }
};

// دالة لاكتشاف رمز الدولة من الرقم
function detectCountryCode(phoneNumber) {
  console.log('🔍 فحص رمز الدولة للرقم:', phoneNumber);
  
  const cleanedNumber = phoneNumber.replace(/\D/g, '');
  
  // إذا كان الرقم يحتوي على رمز دولة مسبقاً
  if (cleanedNumber.length > 10) {
    const possibleCountryCode = cleanedNumber.substring(0, cleanedNumber.length - 9);
    console.log('🌍 رمز دولة محتمل موجود مسبقاً:', possibleCountryCode);
    
    // التحقق من رموز الدول الشائعة
    const knownCodes = ['963', '966', '971', '20', '962', '961', '964', '970', '965', '974', '973'];
    if (knownCodes.includes(possibleCountryCode)) {
      return {
        country: 'غير محدد',
        code: possibleCountryCode,
        hasCountryCode: true,
        originalNumber: phoneNumber,
        cleanedNumber: cleanedNumber
      };
    }
  }
  
  // فحص حسب بداية الرقم
  for (const [prefix, info] of Object.entries(COUNTRY_CODES)) {
    if (phoneNumber.startsWith(prefix.substring(0, 3))) {
      // فحص أكثر دقة باستخدام النمط
      if (info.pattern.test(cleanedNumber)) {
        console.log(`🎯 تم اكتشاف الدولة: ${info.country} (${info.code})`);
        return {
          country: info.country,
          code: info.code,
          hasCountryCode: false,
          originalNumber: phoneNumber,
          cleanedNumber: cleanedNumber,
          prefix: prefix
        };
      }
    }
  }
  
  // إذا بدأ بـ 0 ولم يتم اكتشافه، جرب السعودية كافتراضي
  if (phoneNumber.startsWith('0') && cleanedNumber.length === 10) {
    console.log('🇸🇦 افتراض أنه رقم سعودي');
    return {
      country: 'السعودية (افتراضي)',
      code: '966',
      hasCountryCode: false,
      originalNumber: phoneNumber,
      cleanedNumber: cleanedNumber
    };
  }
  
  console.log('❓ لم يتم اكتشاف رمز الدولة');
  return {
    country: 'غير معروف',
    code: null,
    hasCountryCode: false,
    originalNumber: phoneNumber,
    cleanedNumber: cleanedNumber
  };
}

class OptimizedWhatsAppService {
  constructor() {
    this.client = null;
    this.isReady = false;
    this.verificationCodes = new Map();
    this.qrCodeGenerated = false;
    this.sentMessages = [];
    this.isInitializing = false;
    this.connectionStatus = 'disconnected';
  }

  // تشغيل خدمة WhatsApp بشكل آمن
  async initialize() {
    if (this.isInitializing) {
      console.log('WhatsApp is already initializing...');
      return;
    }

    this.isInitializing = true;
    this.connectionStatus = 'initializing';

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
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor'
          ],
          timeout: 60000
        }
      });

      this.setupEventListeners();

      const initPromise = this.client.initialize();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('WhatsApp initialization timeout')), 90000);
      });

      await Promise.race([initPromise, timeoutPromise]);
      
      console.log('✅ WhatsApp client started successfully');
      
    } catch (error) {
      console.error('❌ WhatsApp initialization failed:', error.message);
      this.isReady = false;
      this.isInitializing = false;
      this.connectionStatus = 'failed';
      
      if (this.client) {
        try {
          await this.client.destroy();
        } catch (destroyError) {
          console.error('Error destroying client:', destroyError.message);
        }
        this.client = null;
      }
      
      console.log('⚠️ WhatsApp service disabled. Server will continue without WhatsApp features.');
    } finally {
      this.isInitializing = false;
    }
  }

  setupEventListeners() {
    this.client.on('qr', (qr) => {
      this.qrCodeGenerated = true;
      this.connectionStatus = 'qr_required';
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

    this.client.on('authenticated', () => {
      console.log('🔐 WhatsApp authenticated successfully');
      this.connectionStatus = 'authenticated';
    });

    this.client.on('ready', () => {
      console.log('\n🎉 ═══════════════════════════════════════');
      console.log('   WhatsApp Client is ready!');
      console.log('   الآن يمكن إرسال رسائل التحقق الحقيقية');
      console.log('═══════════════════════════════════════\n');
      this.isReady = true;
      this.qrCodeGenerated = false;
      this.isInitializing = false;
      this.connectionStatus = 'ready';
    });

    this.client.on('disconnected', (reason) => {
      console.log('❌ WhatsApp Client disconnected:', reason);
      this.isReady = false;
      this.qrCodeGenerated = false;
      this.isInitializing = false;
      this.connectionStatus = 'disconnected';
    });

    this.client.on('auth_failure', (msg) => {
      console.log('❌ WhatsApp authentication failed:', msg);
      this.isReady = false;
      this.qrCodeGenerated = false;
      this.isInitializing = false;
      this.connectionStatus = 'auth_failed';
    });

    this.client.on('loading_screen', (percent, message) => {
      console.log(`⏳ Loading WhatsApp: ${percent}% - ${message}`);
      this.connectionStatus = `loading_${percent}`;
    });

    this.client.on('error', (error) => {
      console.error('WhatsApp Client Error:', error.message);
      this.connectionStatus = 'error';
    });
  }

  // تحقق محسن من حالة الخدمة
  isServiceAvailable() {
    return this.client && 
           (this.isReady || this.connectionStatus === 'ready') && 
           this.connectionStatus !== 'disconnected' && 
           this.connectionStatus !== 'failed' && 
           this.connectionStatus !== 'auth_failed';
  }

  generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // دالة إرسال مباشر بدون أي تحويل - للاستخدام المباشر
  async sendMessageDirect(phoneNumber, message) {
    console.log('📤 إرسال مباشر للرقم:', phoneNumber);
    console.log('📤 الرقم كما هو بدون أي تعديل:', phoneNumber);

    if (!this.isServiceAvailable()) {
      throw new Error(`خدمة WhatsApp غير متاحة. الحالة الحالية: ${this.connectionStatus}`);
    }

    try {
      // إرسال مباشر للرقم كما هو بدون أي تحويل أو تعديل
      const numberId = `${phoneNumber}@c.us`;
      console.log('🎯 معرف WhatsApp المباشر (بدون تحويل):', numberId);

      // محاولة إرسال الرسالة مباشرة
      const result = await this.client.sendMessage(numberId, message);
      
      this.sentMessages.push({
        to: phoneNumber,
        message: message,
        timestamp: new Date(),
        type: 'direct',
        result: result.id || 'sent'
      });
      
      console.log('✅ تم الإرسال المباشر بنجاح للرقم:', phoneNumber);
      console.log('✅ تم استخدام المعرف:', numberId);
      
      return { 
        success: true, 
        message: 'تم إرسال الرسالة بنجاح',
        messageId: result.id,
        phoneNumber: phoneNumber
      };
      
    } catch (error) {
      console.error('❌ خطأ في الإرسال المباشر للرقم:', phoneNumber);
      console.error('❌ تفاصيل الخطأ:', error.message);
      throw new Error(`فشل في إرسال الرسالة للرقم ${phoneNumber}: ${error.message}`);
    }
  }

  // دالة إرسال ذكية مع اكتشاف رمز الدولة
  async sendMessageSmart(phoneNumber, message) {
    console.log('🧠 إرسال ذكي للرقم:', phoneNumber);

    if (!this.isServiceAvailable()) {
      throw new Error(`خدمة WhatsApp غير متاحة. الحالة الحالية: ${this.connectionStatus}`);
    }

    // اكتشاف رمز الدولة
    const countryInfo = detectCountryCode(phoneNumber);
    console.log('🌍 معلومات الدولة:', countryInfo);

    // إنشاء صيغ مختلفة للرقم للمحاولة
    const phoneFormats = [];
    
    // 1. الرقم كما هو (الأولوية الأولى)
    phoneFormats.push({
      number: phoneNumber,
      description: 'الرقم الأصلي كما هو'
    });

    // 2. إذا تم اكتشاف رمز الدولة ولم يكن موجوداً
    if (countryInfo.code && !countryInfo.hasCountryCode) {
      let internationalNumber;
      
      if (phoneNumber.startsWith('0')) {
        // إزالة الصفر الأول وإضافة رمز الدولة
        internationalNumber = countryInfo.code + countryInfo.cleanedNumber.substring(1);
      } else {
        // إضافة رمز الدولة مباشرة
        internationalNumber = countryInfo.code + countryInfo.cleanedNumber;
      }
      
      phoneFormats.push({
        number: internationalNumber,
        description: `رقم دولي ${countryInfo.country} (+${countryInfo.code})`
      });
    }

    // 3. إذا كان الرقم يحتوي على رمز دولة مسبقاً، جرب بدونه
    if (countryInfo.hasCountryCode) {
      const localNumber = '0' + countryInfo.cleanedNumber.substring(countryInfo.code.length);
      phoneFormats.push({
        number: localNumber,
        description: 'رقم محلي (بدون رمز الدولة)'
      });
    }

    // 4. تنسيقات إضافية حسب طول الرقم
    const cleanedNumber = countryInfo.cleanedNumber;
    
    // للأرقام السورية خصوصاً
    if (phoneNumber.startsWith('099') || phoneNumber.startsWith('098') || phoneNumber.startsWith('097')) {
      if (!phoneFormats.some(f => f.number === '963' + cleanedNumber.substring(1))) {
        phoneFormats.push({
          number: '963' + cleanedNumber.substring(1),
          description: 'رقم سوري دولي (963 + الرقم بدون 0)'
        });
      }
    }

    // 5. الرقم بأرقام فقط
    if (cleanedNumber !== phoneNumber) {
      phoneFormats.push({
        number: cleanedNumber,
        description: 'أرقام فقط (تنظيف كامل)'
      });
    }

    console.log(`🔍 سيتم تجريب ${phoneFormats.length} صيغة للرقم:`);
    phoneFormats.forEach((format, index) => {
      console.log(`   ${index + 1}. ${format.number} (${format.description})`);
    });

    let lastError = null;
    
    // تجربة كل صيغة حتى النجاح
    for (let i = 0; i < phoneFormats.length; i++) {
      const format = phoneFormats[i];
      const numberId = `${format.number}@c.us`;
      
      try {
        console.log(`\n🔄 المحاولة ${i + 1}: ${format.description}`);
        console.log(`📱 الرقم: ${format.number}`);
        console.log(`📡 معرف WhatsApp: ${numberId}`);
        
        // محاولة التحقق من وجود الرقم أولاً (إذا كانت الدالة متوفرة)
        if (this.client.getNumberId) {
          try {
            const numberInfo = await this.client.getNumberId(numberId);
            if (numberInfo && numberInfo.exists) {
              console.log(`✅ الرقم ${format.number} موجود في WhatsApp`);
            } else {
              console.log(`❌ الرقم ${format.number} غير موجود في WhatsApp - تجربة الإرسال مباشرة`);
            }
          } catch (checkError) {
            console.log(`⚠️ تعذر التحقق من الرقم: ${checkError.message} - تجربة الإرسال مباشرة`);
          }
        }
        
        // محاولة إرسال الرسالة
        const result = await this.client.sendMessage(numberId, message);
        
        // إذا وصلنا هنا، فقد نجح الإرسال
        this.sentMessages.push({
          to: phoneNumber,
          actualNumberUsed: format.number,
          whatsappId: numberId,
          message: message,
          timestamp: new Date(),
          type: 'smart_send',
          result: result.id || 'sent',
          attemptNumber: i + 1,
          formatDescription: format.description,
          detectedCountry: countryInfo.country,
          countryCode: countryInfo.code
        });
        
        console.log(`🎉 نجح الإرسال بالمحاولة ${i + 1}!`);
        console.log(`✅ تم استخدام الرقم: ${format.number} (${format.description})`);
        console.log(`🌍 الدولة المكتشفة: ${countryInfo.country}`);
        
        return { 
          success: true, 
          message: 'تم إرسال الرسالة بنجاح',
          messageId: result.id,
          originalPhoneNumber: phoneNumber,
          usedPhoneNumber: format.number,
          usedFormat: format.description,
          attemptNumber: i + 1,
          whatsappId: numberId,
          detectedCountry: countryInfo.country,
          countryCode: countryInfo.code
        };
        
      } catch (error) {
        lastError = error;
        console.log(`❌ فشلت المحاولة ${i + 1}: ${error.message}`);
        
        // إذا كانت هذه آخر محاولة، لا نحتاج للانتظار
        if (i < phoneFormats.length - 1) {
          console.log(`⏳ الانتظار قبل المحاولة التالية...`);
          await new Promise(resolve => setTimeout(resolve, 1000)); // انتظار ثانية واحدة
        }
      }
    }
    
    // إذا فشلت جميع المحاولات
    console.log(`❌ فشلت جميع المحاولات (${phoneFormats.length} محاولة)`);
    
    // تحليل نوع الخطأ لإعطاء رسالة مفيدة
    let errorMessage = `فشل في إرسال الرسالة لرقم ${countryInfo.country} بجميع الصيغ المجربة`;
    
    if (lastError) {
      if (lastError.message.includes('Evaluation failed')) {
        errorMessage = `مشكلة في WhatsApp Web - قد يكون الرقم ${phoneNumber} (${countryInfo.country}) غير صحيح أو غير مسجل في WhatsApp`;
      } else if (lastError.message.includes('number not registered')) {
        errorMessage = `الرقم ${phoneNumber} غير مسجل في WhatsApp`;
      } else if (lastError.message.includes('Rate limit')) {
        errorMessage = 'تم إرسال رسائل كثيرة. يرجى الانتظار قليلاً';
      } else {
        errorMessage = `خطأ في الإرسال: ${lastError.message}`;
      }
    }
    
    throw new Error(errorMessage);
  }

  // دالة الإرسال العادية مع التحويل (للتوافق مع الكود القديم)
  async sendMessage(phoneNumber, message) {
    console.log('🔄 محاولة إرسال رسالة WhatsApp...');
    console.log('الرقم المدخل:', phoneNumber);

    if (!this.isServiceAvailable()) {
      throw new Error(`خدمة WhatsApp غير متاحة. الحالة الحالية: ${this.connectionStatus}`);
    }

    try {
      let cleanedNumber = phoneNumber.replace(/\D/g, '');
      console.log('الرقم بعد التنظيف:', cleanedNumber);

      let numberId;
      
      if (phoneNumber.startsWith('0') && cleanedNumber.length === 10) {
        const localNumber = cleanedNumber.substring(1);
        numberId = `966${localNumber}@c.us`;
        console.log('📱 رقم سعودي محلي - تحويل إلى:', numberId);
        
      } else if (cleanedNumber.startsWith('966') && cleanedNumber.length === 12) {
        numberId = `${cleanedNumber}@c.us`;
        console.log('📱 رقم يحتوي على 966 مسبقاً:', numberId);
        
      } else if (cleanedNumber.length === 9 && cleanedNumber.startsWith('5')) {
        numberId = `966${cleanedNumber}@c.us`;
        console.log('📱 رقم سعودي بدون صفر - إضافة 966:', numberId);
        
      } else {
        if (cleanedNumber.length === 9) {
          numberId = `966${cleanedNumber}@c.us`;
        } else {
          numberId = `${cleanedNumber}@c.us`;
        }
        console.log('📱 حالة افتراضية:', numberId);
      }

      console.log('🎯 معرف WhatsApp النهائي:', numberId);

      const result = await this.client.sendMessage(numberId, message);
      
      this.sentMessages.push({
        to: phoneNumber,
        whatsappId: numberId,
        message: message,
        timestamp: new Date(),
        type: 'general',
        result: result.id || 'sent'
      });
      
      console.log('✅ تم إرسال الرسالة بنجاح!');
      
      return { 
        success: true, 
        message: 'تم إرسال الرسالة بنجاح',
        messageId: result.id,
        phoneNumber: phoneNumber,
        whatsappId: numberId
      };
      
    } catch (error) {
      console.error('❌ خطأ في إرسال الرسالة:', error.message);
      
      if (error.message.includes('number not registered')) {
        throw new Error(`الرقم ${phoneNumber} غير مسجل في WhatsApp`);
      } else if (error.message.includes('Rate limit')) {
        throw new Error('تم إرسال رسائل كثيرة. يرجى الانتظار');
      } else if (error.message.includes('timeout')) {
        throw new Error('انتهت مهلة إرسال الرسالة');
      } else {
        throw new Error(`فشل في إرسال الرسالة: ${error.message}`);
      }
    }
  }

  async sendVerificationCode(phoneNumber, userId) {
    if (!this.isServiceAvailable()) {
      throw new Error(`خدمة WhatsApp غير متاحة. تأكد من مسح QR Code أولاً. الحالة: ${this.connectionStatus}`);
    }

    try {
      const code = this.generateVerificationCode();
      
      this.verificationCodes.set(userId, {
        code: code,
        expires: Date.now() + 5 * 60 * 1000,
        phoneNumber: phoneNumber,
        attempts: 0
      });

      const message = `🔐 *رمز التحقق الخاص بك*

الرمز: *${code}*

⏰ صالح لمدة 5 دقائق فقط
🔒 لا تشارك هذا الرمز مع أحد

شكراً لاستخدام خدماتنا 🌟`;

      const result = await this.sendMessage(phoneNumber, message);
      
      if (result.success) {
        this.sentMessages.push({
          to: phoneNumber,
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
          phoneNumber: phoneNumber
        };
      } else {
        throw new Error('فشل في إرسال رمز التحقق');
      }

    } catch (error) {
      console.error('❌ خطأ عام في إرسال رمز التحقق:', error);
      throw error;
    }
  }

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

  formatPhoneNumber(phoneNumber) {
    console.log('🔧 formatPhoneNumber - الرقم المدخل:', phoneNumber);
    
    let formatted = phoneNumber.replace(/\D/g, '');
    
    if (formatted.startsWith('966')) {
      formatted = '0' + formatted.substring(3);
    }
    
    if (formatted.length === 9 && formatted.startsWith('5')) {
      formatted = '0' + formatted;
    }
    
    while (formatted.startsWith('00')) {
      formatted = formatted.substring(1);
    }
    
    console.log('🔧 formatPhoneNumber - الرقم بعد التنسيق:', formatted);
    return formatted;
  }

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
      connectionStatus: this.connectionStatus,
      serviceAvailable: this.isServiceAvailable(),
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
        type: msg.type,
        result: msg.result
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
      this.connectionStatus = 'disconnected';
      await this.initialize();
      return { success: true, message: 'تم إعادة تشغيل الخدمة' };
    } catch (error) {
      console.error('Error restarting WhatsApp:', error);
      return { success: false, error: error.message };
    }
  }

  async cleanup() {
    try {
      if (this.client) {
        await this.client.destroy();
        this.client = null;
      }
      this.isReady = false;
      this.isInitializing = false;
      this.connectionStatus = 'disconnected';
      console.log('✅ WhatsApp service cleaned up');
    } catch (error) {
      console.error('Error cleaning up WhatsApp service:', error);
    }
  }
}

module.exports = new OptimizedWhatsAppService();