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
    endpoints: {
      users: '/api/users',
      stores: '/api/stores',
      products: '/api/products',
      orders: '/api/orders',
      orderItems: '/api/order-items',
      cart: '/api/cart',
      cartItems: '/api/cart-items',
      reviews: '/api/reviews',
      shipping: '/api/shipping'
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
    
    res.json({
      status: 'OK',
      database: 'Connected',
      tablesCount: tables.length,
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
    
    // اختبار قاعدة البيانات
    console.log('📡 Testing database...');
    await db.sequelize.authenticate();
    console.log('✅ Database connected');
    
    // مزامنة النماذج
    console.log('🔄 Synchronizing models...');
    await db.sequelize.sync({ alter: true });
    console.log('✅ Models synchronized');
    
    // عرض الجداول
    const tableResults = await db.sequelize.query("SHOW TABLES", { 
      type: db.sequelize.QueryTypes.SELECT 
    });
    
    const tableNames = tableResults.map(t => Object.values(t)[0]);
    console.log(`📋 Created/Updated ${tableNames.length} tables:`);
    tableNames.forEach(table => console.log(`   • ${table}`));
    
    // تشغيل السيرفر
    app.listen(PORT, '0.0.0.0', () => {
      console.log('\n🚀 ═══════════════════════════════════════');
      console.log('   E-commerce Server is running!');
      console.log('   ═══════════════════════════════════════');
      console.log(`📱 Server: http://localhost:${PORT}`);
      console.log(`🗄️  Database: souq (${tableNames.length} tables)`);
      console.log('\n🛒 API Endpoints:');
      console.log(`   • http://localhost:${PORT}/api/users`);
      console.log(`   • http://localhost:${PORT}/api/products`);
      console.log(`   • http://localhost:${PORT}/api/orders`);
      console.log(`   • http://localhost:${PORT}/api/health`);
      console.log('   ═══════════════════════════════════════\n');
    });

  } catch (error) {
    console.error('\n❌ Server startup failed:', error.message);
    
    if (error.name === 'SequelizeConnectionRefusedError') {
      console.error('💡 Make sure MySQL is running');
      console.error('💡 Create database: CREATE DATABASE souq;');
    }
    
    process.exit(1);
  }
};

// إغلاق آمن
process.on('SIGINT', async () => {
  console.log('\n🔄 Shutting down...');
  await db.sequelize.close();
  console.log('✅ Server closed');
  process.exit(0);
});

// معالجة الأخطاء غير المتوقعة
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
  process.exit(1);
});

// بدء التشغيل
startServer();

module.exports = app;