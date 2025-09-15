const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 4000;

// إعدادات الـ middleware
app.use(cors({
  origin: "http://localhost:3000", // رابط الواجهة الأمامية
  credentials: true               // السماح بإرسال الكوكيز
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// إنشاء مجلد uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📂 Created uploads directory');
}

// خدمة الملفات الثابتة
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// استيراد قاعدة البيانات
const db = require('./models');

// استيراد خدمة WhatsApp مع معالجة الأخطاء
let whatsappService;
try {
  whatsappService = require('./config/whatsapp');
  console.log('✅ WhatsApp service module loaded');
} catch (error) {
  console.error('❌ Failed to load WhatsApp service:', error.message);
  // إنشاء خدمة وهمية في حالة الفشل
  whatsappService = {
    isReady: false,
    verificationCodes: new Map(),
    initialize: async () => { console.log('WhatsApp service disabled'); },
    cleanExpiredCodes: () => 0,
    getStats: () => ({ activeVerifications: 0, verificationsList: [], totalMessagesSent: 0 }),
    getSentMessages: () => [],
    setCustomVerificationCode: () => ({ success: true }),
    clearAllCodes: () => 0,
    restart: async () => ({ success: false, error: 'Service not available' }),
    sendMessage: async () => { throw new Error('WhatsApp service not available'); },
    cleanup: async () => {}
  };
}

// ***** نظام ALTER الجديد *****

// دالة فحص وجود عمود في الجدول
async function columnExists(tableName, columnName) {
  try {
    const result = await db.sequelize.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = '${tableName}' 
      AND COLUMN_NAME = '${columnName}'
    `, { type: db.sequelize.QueryTypes.SELECT });
    
    return result.length > 0;
  } catch (error) {
    console.error(`خطأ في فحص العمود ${columnName} في الجدول ${tableName}:`, error.message);
    return false;
  }
}

// دالة فحص وجود فهرس
async function indexExists(tableName, indexName) {
  try {
    const result = await db.sequelize.query(`
      SELECT INDEX_NAME 
      FROM INFORMATION_SCHEMA.STATISTICS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = '${tableName}' 
      AND INDEX_NAME = '${indexName}'
    `, { type: db.sequelize.QueryTypes.SELECT });
    
    return result.length > 0;
  } catch (error) {
    console.error(`خطأ في فحص الفهرس ${indexName} في الجدول ${tableName}:`, error.message);
    return false;
  }
}

// دالة فحص وجود الجدول
async function tableExists(tableName) {
  try {
    const result = await db.sequelize.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = '${tableName}'
    `, { type: db.sequelize.QueryTypes.SELECT });
    
    return result.length > 0;
  } catch (error) {
    console.error(`خطأ في فحص وجود الجدول ${tableName}:`, error.message);
    return false;
  }
}

// دالة تطبيق تعديلات ALTER الذكية
async function applySmartAlterOperations() {
  console.log('🔄 بدء تطبيق تعديلات ALTER الذكية...');
  
  const alterOperations = [];
  let successCount = 0;
  let skipCount = 0;

  try {
    // ***** تعديلات جدول Stores *****
    if (await tableExists('Stores')) {
      // إضافة العمود is_blocked إذا لم يكن موجوداً
      if (!(await columnExists('Stores', 'is_blocked'))) {
        alterOperations.push({
          table: 'Stores',
          operation: 'ADD COLUMN',
          description: 'إضافة عمود is_blocked',
          sql: `ALTER TABLE Stores ADD COLUMN is_blocked BOOLEAN NOT NULL DEFAULT false`
        });
      }

      // إضافة عمود rating_avg للمتوسط (اختياري)
      if (!(await columnExists('Stores', 'rating_avg'))) {
        alterOperations.push({
          table: 'Stores',
          operation: 'ADD COLUMN',
          description: 'إضافة عمود متوسط التقييم',
          sql: `ALTER TABLE Stores ADD COLUMN rating_avg DECIMAL(3,2) DEFAULT 0.00`
        });
      }

      // إضافة عمود total_reviews (اختياري)
      if (!(await columnExists('Stores', 'total_reviews'))) {
        alterOperations.push({
          table: 'Stores',
          operation: 'ADD COLUMN',
          description: 'إضافة عمود إجمالي التقييمات',
          sql: `ALTER TABLE Stores ADD COLUMN total_reviews INT DEFAULT 0`
        });
      }
    }

    // ***** تعديلات جدول Reviews *****
    if (await tableExists('Reviews')) {
      // إضافة العمود store_id إذا لم يكن موجوداً
      if (!(await columnExists('Reviews', 'store_id'))) {
        alterOperations.push({
          table: 'Reviews',
          operation: 'ADD COLUMN',
          description: 'إضافة عمود store_id',
          sql: `ALTER TABLE Reviews ADD COLUMN store_id INT NULL`
        });
      }

      // إضافة العمود review_type إذا لم يكن موجوداً
      if (!(await columnExists('Reviews', 'review_type'))) {
        alterOperations.push({
          table: 'Reviews',
          operation: 'ADD COLUMN',
          description: 'إضافة عمود review_type',
          sql: `ALTER TABLE Reviews ADD COLUMN review_type ENUM('product', 'store') NOT NULL DEFAULT 'product'`
        });
      }

      // تعديل product_id ليصبح اختياري
      const productIdColumn = await db.sequelize.query(`
        SELECT IS_NULLABLE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'Reviews' 
        AND COLUMN_NAME = 'product_id'
      `, { type: db.sequelize.QueryTypes.SELECT });

      if (productIdColumn.length > 0 && productIdColumn[0].IS_NULLABLE === 'NO') {
        alterOperations.push({
          table: 'Reviews',
          operation: 'MODIFY COLUMN',
          description: 'جعل product_id اختياري',
          sql: `ALTER TABLE Reviews MODIFY COLUMN product_id INT NULL`
        });
      }

      // إضافة Foreign Key للمتجر إذا لم يكن موجوداً
      const storeFKExists = await db.sequelize.query(`
        SELECT CONSTRAINT_NAME 
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'Reviews' 
        AND COLUMN_NAME = 'store_id' 
        AND REFERENCED_TABLE_NAME = 'Stores'
      `, { type: db.sequelize.QueryTypes.SELECT });

      if (storeFKExists.length === 0 && await columnExists('Reviews', 'store_id')) {
        alterOperations.push({
          table: 'Reviews',
          operation: 'ADD FOREIGN KEY',
          description: 'إضافة مفتاح خارجي للمتجر',
          sql: `ALTER TABLE Reviews ADD CONSTRAINT fk_reviews_store FOREIGN KEY (store_id) REFERENCES Stores(store_id) ON DELETE CASCADE`
        });
      }
    }

    // ***** تعديلات إضافية للجداول الأخرى *****
    
    // إضافة فهارس للأداء
    const indexesToAdd = [
      { table: 'Reviews', index: 'idx_reviews_store_id', column: 'store_id' },
      { table: 'Reviews', index: 'idx_reviews_type', column: 'review_type' },
      { table: 'Reviews', index: 'idx_reviews_verified', column: 'is_verified' },
      { table: 'Stores', index: 'idx_stores_blocked', column: 'is_blocked' },
      { table: 'Products', index: 'idx_products_store_id', column: 'store_id' }
    ];

    for (const indexInfo of indexesToAdd) {
      if (await tableExists(indexInfo.table) && 
          await columnExists(indexInfo.table, indexInfo.column) && 
          !(await indexExists(indexInfo.table, indexInfo.index))) {
        alterOperations.push({
          table: indexInfo.table,
          operation: 'ADD INDEX',
          description: `إضافة فهرس ${indexInfo.index}`,
          sql: `ALTER TABLE ${indexInfo.table} ADD INDEX ${indexInfo.index} (${indexInfo.column})`
        });
      }
    }

    // تنفيذ جميع عمليات ALTER
    console.log(`📋 وجدت ${alterOperations.length} عملية تعديل لتطبيقها...`);

    for (const operation of alterOperations) {
      try {
        console.log(`🔄 تطبيق: ${operation.description} على الجدول ${operation.table}`);
        await db.sequelize.query(operation.sql);
        console.log(`✅ نجح: ${operation.description}`);
        successCount++;
      } catch (error) {
        if (error.message.includes('Duplicate column name') || 
            error.message.includes('Duplicate key name') ||
            error.message.includes('already exists')) {
          console.log(`⚠️ تم تخطي: ${operation.description} (موجود مسبقاً)`);
          skipCount++;
        } else {
          console.error(`❌ فشل: ${operation.description} - ${error.message}`);
        }
      }
    }

    console.log(`🎉 انتهت عمليات ALTER: ${successCount} نجح، ${skipCount} تم تخطيه`);
    
    return {
      total: alterOperations.length,
      success: successCount,
      skipped: skipCount,
      operations: alterOperations
    };

  } catch (error) {
    console.error('❌ خطأ في تطبيق عمليات ALTER:', error.message);
    throw error;
  }
}

// دالة إعادة تعيين قاعدة البيانات بالكامل (الطريقة القديمة)
async function resetDatabase() {
  try {
    console.log('🔄 بدء إعادة تعيين قاعدة البيانات...');
    
    // إيقاف فحص foreign keys مؤقتاً
    await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    console.log('⚙️ تم إيقاف فحص foreign keys');
    
    // الحصول على جميع الجداول
    const tables = await db.sequelize.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_TYPE = 'BASE TABLE'
    `, { type: db.sequelize.QueryTypes.SELECT });

    console.log(`📋 وجدت ${tables.length} جدول للحذف`);

    // حذف جميع الجداول
    for (const table of tables) {
      const tableName = table.TABLE_NAME;
      try {
        await db.sequelize.query(`DROP TABLE IF EXISTS \`${tableName}\``);
        console.log(`✅ تم حذف الجدول: ${tableName}`);
      } catch (error) {
        console.log(`⚠️ فشل حذف الجدول ${tableName}: ${error.message}`);
      }
    }

    // إعادة تفعيل فحص foreign keys
    await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('⚙️ تم إعادة تفعيل فحص foreign keys');
    
    console.log('🎉 تم حذف جميع الجداول بنجاح!');
    return true;
    
  } catch (error) {
    console.error('❌ خطأ في إعادة تعيين قاعدة البيانات:', error.message);
    // إعادة تفعيل foreign keys حتى في حالة الخطأ
    try {
      await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    } catch (fkError) {
      console.error('❌ خطأ في إعادة تفعيل foreign keys:', fkError.message);
    }
    throw error;
  }
}

// دالة تنظيف الفهارس المكررة
async function cleanupIndexes() {
  try {
    console.log('🔍 بدء فحص وتنظيف الفهارس...');
    
    // الحصول على جميع الجداول
    const tables = await db.sequelize.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_TYPE = 'BASE TABLE'
    `, { type: db.sequelize.QueryTypes.SELECT });

    let totalIndexesRemoved = 0;
    
    for (const table of tables) {
      const tableName = table.TABLE_NAME;
      
      // الحصول على الفهارس الحالية (باستثناء PRIMARY KEY)
      const indexes = await db.sequelize.query(`
        SELECT 
          INDEX_NAME,
          GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as COLUMNS,
          NON_UNIQUE,
          COUNT(*) as COLUMN_COUNT
        FROM INFORMATION_SCHEMA.STATISTICS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = '${tableName}'
        AND INDEX_NAME != 'PRIMARY'
        GROUP BY INDEX_NAME
      `, { type: db.sequelize.QueryTypes.SELECT });

      if (indexes.length === 0) continue;

      console.log(`📊 جدول ${tableName}: ${indexes.length} فهرس موجود`);

      // تجميع الفهارس حسب الأعمدة للعثور على المكررة
      const indexGroups = {};
      
      for (const index of indexes) {
        const columns = index.COLUMNS;
        if (!indexGroups[columns]) {
          indexGroups[columns] = [];
        }
        indexGroups[columns].push(index);
      }

      // حذف الفهارس المكررة (الاحتفاظ بالأول فقط)
      for (const [columns, duplicateIndexes] of Object.entries(indexGroups)) {
        if (duplicateIndexes.length > 1) {
          console.log(`⚠️  وجدت ${duplicateIndexes.length} فهارس مكررة للأعمدة: ${columns}`);
          
          // حذف الفهارس المكررة (الاحتفاظ بالأول)
          for (let i = 1; i < duplicateIndexes.length; i++) {
            const indexToRemove = duplicateIndexes[i];
            try {
              await db.sequelize.query(`DROP INDEX \`${indexToRemove.INDEX_NAME}\` ON \`${tableName}\``);
              console.log(`✅ تم حذف الفهرس المكرر: ${indexToRemove.INDEX_NAME} من ${tableName}`);
              totalIndexesRemoved++;
            } catch (error) {
              console.log(`❌ فشل حذف الفهرس ${indexToRemove.INDEX_NAME}: ${error.message}`);
            }
          }
        }
      }

      // حذف الفهارس الزائدة عن الحاجة (أكثر من 20 فهرس لكل جدول)
      if (indexes.length > 20) {
        console.log(`⚠️  الجدول ${tableName} يحتوي على ${indexes.length} فهرس، سيتم حذف الزائد`);
        
        // ترتيب الفهارس حسب الأهمية (UNIQUE أولاً، ثم غير UNIQUE)
        const sortedIndexes = indexes.sort((a, b) => {
          if (a.NON_UNIQUE !== b.NON_UNIQUE) {
            return a.NON_UNIQUE - b.NON_UNIQUE; // UNIQUE أولاً (0 قبل 1)
          }
          return a.COLUMN_COUNT - b.COLUMN_COUNT; // الفهارس البسيطة أولاً
        });

        // حذف الفهارس الزائدة
        for (let i = 20; i < sortedIndexes.length; i++) {
          const indexToRemove = sortedIndexes[i];
          try {
            await db.sequelize.query(`DROP INDEX \`${indexToRemove.INDEX_NAME}\` ON \`${tableName}\``);
            console.log(`✅ تم حذف الفهرس الزائد: ${indexToRemove.INDEX_NAME} من ${tableName}`);
            totalIndexesRemoved++;
          } catch (error) {
            console.log(`❌ فشل حذف الفهرس ${indexToRemove.INDEX_NAME}: ${error.message}`);
          }
        }
      }
    }

    console.log(`🎉 تم تنظيف الفهارس بنجاح! إجمالي الفهارس المحذوفة: ${totalIndexesRemoved}`);
    return totalIndexesRemoved;
    
  } catch (error) {
    console.error('❌ خطأ في تنظيف الفهارس:', error.message);
    return 0;
  }
}

// دالة منع إنشاء فهارس مكررة
function preventDuplicateIndexes() {
  // تعديل إعدادات Sequelize لمنع الفهارس التلقائية
  const originalDefine = db.sequelize.define;
  
  db.sequelize.define = function(modelName, attributes, options = {}) {
    // إعدادات افتراضية لمنع الفهارس الزائدة
    const defaultOptions = {
      indexes: [], // منع الفهارس التلقائية
      timestamps: options.timestamps !== false, // الاحتفاظ بـ timestamps إذا لم يتم تعطيلها
      ...options
    };
    
    return originalDefine.call(this, modelName, attributes, defaultOptions);
  };
  
  console.log('🛡️  تم تفعيل الحماية من الفهارس المكررة');
}

// استيراد الروابط
const userRoutes = require('./routes/userRoutes');           
const storeRoutes = require('./routes/storeRoutes');         
const productRoutes = require('./routes/productRoutes');     
const orderRoutes = require('./routes/orderRoutes');         
const orderItemRoutes = require('./routes/orderItemRoutes');
const cartRoutes = require('./routes/cartRoutes');           
const cartItemRoutes = require('./routes/cartItemRoutes');  
const reviewRoutes = require('./routes/reviewRoutes');       
const shippingRoutes = require('./routes/shippingRoutes');   

// استخدام الروابط
app.use('/users', userRoutes);               
app.use('/stores', storeRoutes);             
app.use('/products', productRoutes);         
app.use('/orders', orderRoutes);             
app.use('/order-items', orderItemRoutes);    
app.use('/cart', cartRoutes);                
app.use('/cart-items', cartItemRoutes);      
app.use('/reviews', reviewRoutes);           
app.use('/shipping', shippingRoutes);        

// الرئيسية
app.get('/', (req, res) => {
  res.json({
    message: 'مرحباً بك في API متجر التجارة الإلكترونية',
    version: '1.0.0',
    status: 'Server is running successfully!',
    whatsapp_status: whatsappService.isReady ? 'Connected' : 'Disconnected',
    endpoints: {
      users: '/users',
      stores: '/stores',
      products: '/products',
      orders: '/orders',
      orderItems: '/order-items',
      cart: '/cart',
      cartItems: '/cart-items',
      reviews: '/reviews',
      shipping: '/shipping',
      whatsapp: {
        status: '/api/whatsapp/status',
        verification: '/users/send-verification',
        verify: '/users/verify-whatsapp',
        activeCodes: '/api/whatsapp/active-codes',
        sentMessages: '/api/whatsapp/sent-messages'
      },
      database: {
        health: '/api/health',
        alterDatabase: '/api/alter-database',
        resetDatabase: '/api/reset-database',
        cleanupIndexes: '/api/cleanup-indexes'
      }
    }
  });
});

// فحص حالة قاعدة البيانات
app.get('/api/health', async (req, res) => {
  try {
    await db.sequelize.authenticate();
    const tables = await db.sequelize.query("SHOW TABLES", { 
      type: db.sequelize.QueryTypes.SELECT 
    });
    
    // فحص عدد الفهارس
    const indexCount = await db.sequelize.query(`
      SELECT COUNT(DISTINCT INDEX_NAME) as total_indexes
      FROM INFORMATION_SCHEMA.STATISTICS 
      WHERE TABLE_SCHEMA = DATABASE()
    `, { type: db.sequelize.QueryTypes.SELECT });
    
    res.json({
      status: 'OK',
      database: 'Connected',
      whatsapp: whatsappService.isReady ? 'Connected' : 'Disconnected',
      tablesCount: tables.length,
      totalIndexes: indexCount[0].total_indexes,
      activeVerifications: whatsappService.verificationCodes ? whatsappService.verificationCodes.size : 0,
      tables: tables.map(t => Object.values(t)[0])
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      database: 'Disconnected',
      error: error.message
    });
  }
});

// ***** نقطة نهاية جديدة لتطبيق ALTER بدون حذف البيانات *****
app.post('/api/alter-database', async (req, res) => {
  try {
    console.log('🔄 بدء عملية ALTER الذكية للجداول...');
    
    const result = await applySmartAlterOperations();
    
    // الحصول على الجداول بعد التعديل
    const tables = await db.sequelize.query("SHOW TABLES", { 
      type: db.sequelize.QueryTypes.SELECT 
    });
    
    res.json({
      success: true,
      message: 'تم تطبيق تعديلات ALTER بنجاح',
      tablesCount: tables.length,
      alterResults: {
        totalOperations: result.total,
        successfulOperations: result.success,
        skippedOperations: result.skipped,
        operations: result.operations.map(op => ({
          table: op.table,
          operation: op.operation,
          description: op.description
        }))
      },
      tables: tables.map(t => Object.values(t)[0])
    });
    
  } catch (error) {
    console.error('❌ خطأ في تطبيق عمليات ALTER:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'فشل في تطبيق عمليات ALTER'
    });
  }
});

// فحص حالة WhatsApp
app.get('/api/whatsapp/status', (req, res) => {
  res.json({
    isReady: whatsappService.isReady,
    activeVerifications: whatsappService.verificationCodes ? whatsappService.verificationCodes.size : 0,
    message: whatsappService.isReady 
      ? 'WhatsApp service is connected and ready' 
      : 'WhatsApp service is not available'
  });
});

// إعادة تشغيل خدمة WhatsApp
app.post('/api/whatsapp/restart', async (req, res) => {
  try {
    console.log('🔄 Restarting WhatsApp service...');
    const result = await whatsappService.restart();
    res.json({
      success: result.success,
      message: result.success ? 'WhatsApp service restarted successfully' : result.error,
      isReady: whatsappService.isReady
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// نقطة نهاية لتنظيف الفهارس يدوياً
app.post('/api/cleanup-indexes', async (req, res) => {
  try {
    const removedCount = await cleanupIndexes();
    res.json({
      success: true,
      message: 'تم تنظيف الفهارس بنجاح',
      removedIndexes: removedCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ***** نقطة نهاية لإعادة تعيين قاعدة البيانات بالكامل (الطريقة القديمة) *****
app.post('/api/reset-database', async (req, res) => {
  try {
    console.log('🚨 تحذير: بدء إعادة تعيين قاعدة البيانات بالكامل!');
    
    // إعادة تعيين قاعدة البيانات
    await resetDatabase();
    
    // إعادة إنشاء الجداول
    console.log('🔄 إعادة إنشاء الجداول...');
    await db.sequelize.sync({ 
      force: false,
      alter: false
     });
    console.log('✅ تم إعادة إنشاء الجداول بنجاح');
    
    // الحصول على الجداول الجديدة
    const tables = await db.sequelize.query("SHOW TABLES", { 
      type: db.sequelize.QueryTypes.SELECT 
    });
    
    res.json({
      success: true,
      message: 'تم إعادة تعيين قاعدة البيانات بالكامل بنجاح',
      tablesCreated: tables.length,
      tables: tables.map(t => Object.values(t)[0])
    });
    
  } catch (error) {
    console.error('❌ خطأ في إعادة تعيين قاعدة البيانات:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'فشل في إعادة تعيين قاعدة البيانات'
    });
  }
});

// تنظيف رموز التحقق المنتهية الصلاحية يدوياً
app.post('/api/whatsapp/cleanup-codes', (req, res) => {
  try {
    const cleanedCount = whatsappService.cleanExpiredCodes();
    res.json({
      success: true,
      message: 'تم تنظيف رموز التحقق المنتهية الصلاحية',
      activeVerifications: whatsappService.verificationCodes ? whatsappService.verificationCodes.size : 0,
      cleanedCount: cleanedCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// عرض جميع رموز التحقق النشطة (للتطوير)
app.get('/api/whatsapp/active-codes', (req, res) => {
  try {
    const stats = whatsappService.getStats();
    res.json({
      activeVerifications: stats.activeVerifications,
      codes: stats.verificationsList,
      totalMessagesSent: stats.totalMessagesSent,
      isReady: whatsappService.isReady
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// عرض آخر الرسائل المرسلة
app.get('/api/whatsapp/sent-messages', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const messages = whatsappService.getSentMessages(limit);
    res.json({
      totalMessages: messages.length,
      messages: messages
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// تعيين رمز تحقق مخصص (للاختبار)
app.post('/api/whatsapp/set-custom-code', (req, res) => {
  try {
    const { user_id, code, phone_number } = req.body;
    
    if (!user_id || !code || !phone_number) {
      return res.status(400).json({
        error: 'user_id, code, and phone_number are required'
      });
    }

    const result = whatsappService.setCustomVerificationCode(
      parseInt(user_id), 
      code, 
      phone_number
    );

    res.json({
      success: true,
      message: 'تم تعيين رمز التحقق المخصص',
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// حذف جميع رموز التحقق النشطة
app.delete('/api/whatsapp/clear-codes', (req, res) => {
  try {
    const count = whatsappService.clearAllCodes();
    res.json({
      success: true,
      message: `تم حذف ${count} رمز تحقق`,
      clearedCount: count
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// إرسال رسالة نصية عامة
app.post('/api/whatsapp/send-message', async (req, res) => {
  try {
    const { phone_number, message } = req.body;
    
    if (!phone_number || !message) {
      return res.status(400).json({
        error: 'phone_number and message are required'
      });
    }

    const result = await whatsappService.sendMessage(phone_number, message);

    res.json({
      success: result.success,
      message: 'تم إرسال الرسالة بنجاح',
      to: phone_number,
      content: message
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// معالجة الأخطاء
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  
  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      error: 'خطأ في التحقق من البيانات',
      details: err.errors.map(e => e.message)
    });
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(400).json({
      error: 'البيانات موجودة مسبقاً'
    });
  }

  res.status(500).json({
    error: 'حدث خطأ في السيرفر',
    message: err.message
  });
});

// الروابط غير الموجودة
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'المسار غير موجود',
    path: req.originalUrl
  });
});

// تشغيل السيرفر
const startServer = async () => {
  try {
    console.log('🔄 Starting server...');
    
    // تفعيل الحماية من الفهارس المكررة
    preventDuplicateIndexes();
    
    // اختبار قاعدة البيانات
    console.log('📡 Testing database...');
    await db.sequelize.authenticate();
    console.log('✅ Database connected');
    
    // تنظيف الفهارس المكررة قبل المزامنة
    await cleanupIndexes();
    
    // مزامنة النماذج بدون حذف البيانات
    console.log('🔄 Synchronizing models without data loss...');
    await db.sequelize.sync({ 
      alter: true, // عدم تطبيق ALTER تلقائياً
      force: false  // عدم حذف الجداول الموجودة
    });
    console.log('✅ Models synchronized safely');
    
    // تطبيق عمليات ALTER الذكية
    console.log('🔄 Applying smart ALTER operations...');
    try {
      const alterResult = await applySmartAlterOperations();
      console.log(`✅ ALTER operations completed: ${alterResult.success} successful, ${alterResult.skipped} skipped`);
    } catch (alterError) {
      console.warn('⚠️ Some ALTER operations failed:', alterError.message);
      console.warn('📝 Database structure may need manual review');
    }
    
    // تشغيل خدمة WhatsApp بشكل آمن
    console.log('📱 Initializing WhatsApp service...');
    try {
      // تشغيل WhatsApp في background لعدم إيقاف الخادم
      whatsappService.initialize().catch(error => {
        console.warn('⚠️ WhatsApp initialization failed:', error.message);
        console.warn('📱 Server will continue without WhatsApp features');
      });
      console.log('✅ WhatsApp service initialization started');
    } catch (whatsappError) {
      console.warn('⚠️ WhatsApp service failed to start:', whatsappError.message);
      console.warn('📱 Server will continue without WhatsApp features');
    }

    // تنظيف دوري لرموز التحقق المنتهية الصلاحية كل 10 دقائق
    setInterval(() => {
      try {
        whatsappService.cleanExpiredCodes();
      } catch (error) {
        console.error('خطأ في تنظيف رموز التحقق:', error.message);
      }
    }, 10 * 60 * 1000);

    // تنظيف دوري للفهارس كل ساعة
    setInterval(async () => {
      try {
        await cleanupIndexes();
      } catch (error) {
        console.error('خطأ في التنظيف الدوري للفهارس:', error.message);
      }
    }, 60 * 60 * 1000);
    
    // عرض الجداول والفهارس
    const tableResults = await db.sequelize.query("SHOW TABLES", { 
      type: db.sequelize.QueryTypes.SELECT 
    });
    
    const tableNames = tableResults.map(t => Object.values(t)[0]);
    
    // عد الفهارس الإجمالية
    const indexCount = await db.sequelize.query(`
      SELECT COUNT(DISTINCT INDEX_NAME) as total_indexes
      FROM INFORMATION_SCHEMA.STATISTICS 
      WHERE TABLE_SCHEMA = DATABASE()
    `, { type: db.sequelize.QueryTypes.SELECT });
    
    console.log(`📋 Database has ${tableNames.length} tables with ${indexCount[0].total_indexes} total indexes`);
    tableNames.forEach(table => console.log(`   • ${table}`));
    
    // تشغيل السيرفر
    app.listen(PORT, '0.0.0.0', () => {
      console.log('\n🚀 ═══════════════════════════════════════');
      console.log('   E-commerce Server is running!');
      console.log('   ═══════════════════════════════════════');
      console.log(`📱 Server: http://localhost:${PORT}`);
      console.log(`🗄️ Database: souq (${tableNames.length} tables, ${indexCount[0].total_indexes} indexes)`);
      console.log(`📲 WhatsApp: ${whatsappService.isReady ? 'Connected ✅' : 'Initializing... ⏳'}`);
      console.log(`🔢 Active Verifications: ${whatsappService.verificationCodes ? whatsappService.verificationCodes.size : 0}`);
      console.log('\n🛒 API Endpoints:');
      console.log(`   • http://localhost:${PORT}/users/register`);
      console.log(`   • http://localhost:${PORT}/users/login`);
      console.log(`   • http://localhost:${PORT}/users/send-verification`);
      console.log(`   • http://localhost:${PORT}/users/verify-whatsapp`);
      console.log(`   • http://localhost:${PORT}/users/verification-status/:user_id`);
      console.log('\n📱 WhatsApp Management:');
      console.log(`   • http://localhost:${PORT}/api/whatsapp/status`);
      console.log(`   • http://localhost:${PORT}/api/whatsapp/active-codes`);
      console.log(`   • http://localhost:${PORT}/api/whatsapp/sent-messages`);
      console.log(`   • http://localhost:${PORT}/api/whatsapp/set-custom-code (POST)`);
      console.log(`   • http://localhost:${PORT}/api/whatsapp/clear-codes (DELETE)`);
      console.log(`   • http://localhost:${PORT}/api/whatsapp/send-message (POST)`);
      console.log(`   • http://localhost:${PORT}/api/whatsapp/restart (POST)`);
      console.log(`   • http://localhost:${PORT}/api/whatsapp/cleanup-codes (POST)`);
      console.log('\n🔧 Database Management:');
      console.log(`   • http://localhost:${PORT}/api/health (GET) - فحص حالة قاعدة البيانات`);
      console.log(`   • http://localhost:${PORT}/api/alter-database (POST) - 🆕 تطبيق ALTER بدون حذف البيانات`);
      console.log(`   • http://localhost:${PORT}/api/cleanup-indexes (POST) - تنظيف الفهارس المكررة`);
      console.log(`   • http://localhost:${PORT}/api/reset-database (POST) - 🚨 إعادة تعيين كاملة (خطر!)`);
      console.log('   ═══════════════════════════════════════\n');
      
      console.log('🆕 المميزات الجديدة:');
      console.log('   • نظام ALTER ذكي لتحديث الجداول بدون فقدان البيانات');
      console.log('   • فحص تلقائي لوجود الأعمدة والفهارس قبل الإضافة');
      console.log('   • دعم تقييمات المتاجر والمنتجات في نفس الجدول');
      console.log('   • حماية من الفهارس المكررة');
      console.log('   • تحديثات آمنة للهيكل بدون توقف الخدمة\n');
      
      if (!whatsappService.isReady) {
        console.log('📱 WhatsApp Setup Instructions:');
        console.log('   1. Watch for QR code in terminal (may take 30-60 seconds)');
        console.log('   2. Scan QR code with WhatsApp');
        console.log('   3. Wait for "WhatsApp Client is ready!" message');
        console.log('   4. Test verification: POST /users/send-verification');
        console.log('   5. Check status: GET /api/whatsapp/status\n');
      } else {
        console.log('🎉 WhatsApp Real Service Ready!');
        console.log('   📤 Real WhatsApp messages will be sent');
        console.log('   🔍 Use /api/whatsapp/active-codes to see active codes');
        console.log('   💬 Use /api/whatsapp/sent-messages to see message history\n');
      }
      
      console.log('✨ تم تشغيل السيرفر مع نظام ALTER الآمن');
      console.log('   جميع البيانات الموجودة محفوظة ');
      console.log('   يمكنك الآن إضافة حقول جديدة بأمان باستخدام POST /api/alter-database\n');
    });

  } catch (error) {
    console.error('\n❌ Server startup failed:', error.message);
    
    if (error.name === 'SequelizeConnectionRefusedError') {
      console.error('💡 Make sure MySQL is running');
      console.error('💡 Create database: CREATE DATABASE souq;');
    }
    
    if (error.message.includes('Too many keys specified')) {
      console.error('💡 Try running: POST http://localhost:4000/api/cleanup-indexes');
    }
    
    if (error.message.includes('Foreign key constraint')) {
      console.error('💡 Database structure conflict detected');
      console.error('💡 Try running: POST http://localhost:4000/api/alter-database (safe)');
      console.error('💡 Or if needed: POST http://localhost:4000/api/reset-database (destructive)');
    }
    
    process.exit(1);
  }
};

// إغلاق آمن
process.on('SIGINT', async () => {
  console.log('\n🔄 Shutting down...');
  
  // إغلاق خدمة WhatsApp
  try {
    await whatsappService.cleanup();
  } catch (error) {
    console.error('❌ Error closing WhatsApp service:', error.message);
  }
  
  // إغلاق قاعدة البيانات
  try {
    await db.sequelize.close();
    console.log('✅ Database connection closed');
  } catch (error) {
    console.error('❌ Error closing database:', error.message);
  }
  
  console.log('✅ Server closed');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await whatsappService.cleanup();
  process.exit(0);
});

// معالجة الأخطاء غير المتوقعة
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  // لا تتوقف الخادم فقط بسبب خطأ WhatsApp
  if (!error.message.includes('whatsapp') && !error.message.includes('puppeteer')) {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // لا تتوقف الخادم فقط بسبب خطأ WhatsApp
  if (!String(reason).includes('whatsapp') && !String(reason).includes('puppeteer')) {
    process.exit(1);
  }
});

// بدء التشغيل
startServer();

module.exports = app;