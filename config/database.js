const { Sequelize } = require('sequelize');
require('dotenv').config();

// إعدادات قاعدة البيانات
const sequelize = new Sequelize(
  process.env.DB_NAME || 'souq',      // اسم قاعدة البيانات
  process.env.DB_USER || 'root',      // اسم المستخدم
  process.env.DB_PASS || '',          // كلمة المرور
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    dialectOptions: {
      charset: 'utf8mb4' // هنا فقط
    },
    define: {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci' // ضع الـ collation هنا بدل dialectOptions
    },
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    timezone: '+03:00' // توقيت السعودية/الخليج
  }
);


// اختبار الاتصال
sequelize.authenticate()
  .then(() => {
    console.log('✅ Database connection established successfully.');
  })
  .catch(err => {
    console.error('❌ Unable to connect to the database:', err.message);
  });

module.exports = sequelize;