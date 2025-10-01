const Sequelize = require('sequelize');
const sequelize = require('../config/database');

const db = {};
db.Sequelize = Sequelize;
db.sequelize = sequelize;

// ===== استيراد جميع الموديلات أولاً =====
console.log('🔄 Loading models...');

try {
  db.User = require('./User')(sequelize, Sequelize);
  console.log('✅ Loaded model: User');
} catch (error) {
  console.error('❌ Failed to load User model:', error.message);
}

try {
  db.Store = require('./Store')(sequelize, Sequelize);
  console.log('✅ Loaded model: Store');
} catch (error) {
  console.error('❌ Failed to load Store model:', error.message);
}

try {
  db.Product = require('./Product')(sequelize, Sequelize);
  console.log('✅ Loaded model: Product');
} catch (error) {
  console.error('❌ Failed to load Product model:', error.message);
}

try {
  db.Order = require('./Order')(sequelize, Sequelize);
  console.log('✅ Loaded model: Order');
} catch (error) {
  console.error('❌ Failed to load Order model:', error.message);
}

try {
  db.OrderItem = require('./OrderItem')(sequelize, Sequelize);
  console.log('✅ Loaded model: OrderItem');
} catch (error) {
  console.error('❌ Failed to load OrderItem model:', error.message);
}

try {
  db.Shipping = require('./Shipping')(sequelize, Sequelize);
  console.log('✅ Loaded model: Shipping');
} catch (error) {
  console.error('❌ Failed to load Shipping model:', error.message);
}

try {
  db.Cart = require('./Cart')(sequelize, Sequelize);
  console.log('✅ Loaded model: Cart');
} catch (error) {
  console.error('❌ Failed to load Cart model:', error.message);
}

try {
  db.CartItem = require('./CartItem')(sequelize, Sequelize);
  console.log('✅ Loaded model: CartItem');
} catch (error) {
  console.error('❌ Failed to load CartItem model:', error.message);
}

try {
  db.Review = require('./Review')(sequelize, Sequelize);
  console.log('✅ Loaded model: Review');
} catch (error) {
  console.error('❌ Failed to load Review model:', error.message);
}

// ===== إضافة موديل LoginAttempts =====
try {
  db.LoginAttempts = require('./LoginAttempts')(sequelize, Sequelize);
  console.log('✅ Loaded model: LoginAttempts');
} catch (error) {
  console.error('❌ Failed to load LoginAttempts model:', error.message);
}

// ===== التحقق من تحميل الموديلات الأساسية =====
const coreModels = ['User', 'Store', 'Product', 'Order', 'OrderItem', 'Shipping', 'Cart', 'CartItem', 'Review'];
const loadedCoreModels = coreModels.filter(modelName => db[modelName]);
const missingCoreModels = coreModels.filter(modelName => !db[modelName]);

if (missingCoreModels.length > 0) {
  console.error('❌ Missing core models:', missingCoreModels.join(', '));
  console.error('⚠️  Skipping relations setup due to missing models');
} else {
  console.log('✅ All core models loaded successfully');
  
  // ===== تعريف العلاقات الأساسية =====
  console.log('🔄 Setting up core relations...');
  
  try {
    // ========== العلاقات الأساسية ==========
    
    // علاقة المستخدم مع المتاجر
    db.User.hasMany(db.Store, { 
      foreignKey: 'user_id', 
      onDelete: 'CASCADE' 
    });
    db.Store.belongsTo(db.User, { 
      foreignKey: 'user_id' 
    });

    // علاقة المتجر مع المنتجات
    db.Store.hasMany(db.Product, { 
      foreignKey: 'store_id', 
      onDelete: 'CASCADE' 
    });
    db.Product.belongsTo(db.Store, { 
      foreignKey: 'store_id' 
    });

    // علاقة المتجر مع الطلبات
    db.Store.hasMany(db.Order, { 
      foreignKey: 'store_id', 
      onDelete: 'CASCADE' 
    });
    db.Order.belongsTo(db.Store, { 
      foreignKey: 'store_id' 
    });

    // علاقة الطلب مع عناصر الطلب
    db.Order.hasMany(db.OrderItem, { 
      foreignKey: 'order_id', 
      onDelete: 'CASCADE' 
    });
    db.OrderItem.belongsTo(db.Order, { 
      foreignKey: 'order_id' 
    });

    // علاقة المنتج مع عناصر الطلب
    db.Product.hasMany(db.OrderItem, { 
      foreignKey: 'product_id', 
      onDelete: 'CASCADE' 
    });
    db.OrderItem.belongsTo(db.Product, { 
      foreignKey: 'product_id' 
    });

    // علاقة السلة مع عناصر السلة
    db.Cart.hasMany(db.CartItem, { 
      foreignKey: 'cart_id', 
      onDelete: 'CASCADE' 
    });
    db.CartItem.belongsTo(db.Cart, { 
      foreignKey: 'cart_id' 
    });

    // علاقة المنتج مع عناصر السلة
    db.Product.hasMany(db.CartItem, { 
      foreignKey: 'product_id', 
      onDelete: 'CASCADE' 
    });
    db.CartItem.belongsTo(db.Product, { 
      foreignKey: 'product_id' 
    });

    console.log('✅ Basic relations defined');

    // ========== علاقات التقييمات ==========
    
    // علاقة المنتج مع التقييمات
    db.Product.hasMany(db.Review, { 
      foreignKey: 'product_id',
      as: 'reviews',
      onDelete: 'CASCADE',
      scope: {
        review_type: 'product'
      }
    });
    db.Review.belongsTo(db.Product, { 
      foreignKey: 'product_id',
      as: 'product'
    });

    // علاقة المتجر مع التقييمات المباشرة
    db.Store.hasMany(db.Review, { 
      foreignKey: 'store_id',
      as: 'storeReviews',
      onDelete: 'CASCADE',
      scope: {
        review_type: 'store'
      }
    });
    db.Review.belongsTo(db.Store, { 
      foreignKey: 'store_id',
      as: 'store'
    });

    // علاقة إضافية: المتجر مع جميع التقييمات
    db.Store.hasMany(db.Review, {
      foreignKey: 'store_id',
      as: 'allStoreReviews',
      onDelete: 'CASCADE'
    });

    console.log('✅ Review relations defined');

    // ========== دوال مساعدة للموديلات الأساسية ==========
    
    // إضافة دوال مساعدة للـ Order model
    db.Order.prototype.getShippingInfo = async function() {
      if (!this.purchase_id) {
        return null;
      }
      return await db.Shipping.findOne({
        where: { purchase_id: this.purchase_id }
      });
    };
    
    // إضافة دوال مساعدة للـ Shipping model
    db.Shipping.prototype.getOrderInfo = async function() {
      if (!this.purchase_id) {
        return null;
      }
      return await db.Order.findOne({
        where: { purchase_id: this.purchase_id }
      });
    };
    
    // دالة مساعدة للحصول على الطلب مع معلومات الشحن
    db.Order.findWithShipping = async function(whereCondition) {
      const orders = await this.findAll({
        where: whereCondition
      });
      
      for (let order of orders) {
        if (order.purchase_id) {
          order.dataValues.ShippingInfo = await db.Shipping.findOne({
            where: { purchase_id: order.purchase_id }
          });
        }
      }
      
      return orders;
    };

    // دالة للمتجر للحصول على تقييمات منتجاته
    db.Store.prototype.getProductReviews = async function() {
      return await db.Review.findAll({
        include: [
          {
            model: db.Product,
            as: 'product',
            where: { store_id: this.store_id },
            required: true
          }
        ],
        where: { review_type: 'product' }
      });
    };

    console.log('✅ Helper functions defined');

  } catch (error) {
    console.error('❌ Failed to define core relations:', error.message);
    console.error('Full error:', error);
  }
}

// ===== إعداد LoginAttempts منفصلاً (بدون Foreign Keys صارمة) =====
if (db.LoginAttempts && db.User) {
  try {
    console.log('🔄 Setting up LoginAttempts relations...');
    
    // علاقات بسيطة للتتبع والإحصائيات (بدون قيود FK صارمة)
    db.User.hasMany(db.LoginAttempts, { 
      foreignKey: 'username',
      sourceKey: 'username',
      as: 'loginAttempts',
      constraints: false  // بدون قيود FK لتجنب مشاكل التهجير
    });
    
    db.LoginAttempts.belongsTo(db.User, { 
      foreignKey: 'username',
      targetKey: 'username',
      as: 'user',
      constraints: false  // بدون قيود FK
    });

    // علاقة للمدير الذي ألغى الحظر (بدون قيود صارمة)
    db.LoginAttempts.belongsTo(db.User, {
      foreignKey: 'unlocked_by',
      as: 'adminUnlocker',
      constraints: false  // بدون قيود FK
    });

    console.log('✅ LoginAttempts relations defined (without strict FK constraints)');

  } catch (error) {
    console.error('❌ Failed to define LoginAttempts relations:', error.message);
    // لا نوقف التطبيق إذا فشلت علاقات LoginAttempts
    console.log('⚠️  Continuing without LoginAttempts relations...');
  }
} else {
  if (!db.LoginAttempts) {
    console.log('⚠️  LoginAttempts model not loaded, skipping its relations');
  }
  if (!db.User) {
    console.log('⚠️  User model not loaded, skipping LoginAttempts relations');
  }
}

console.log('✅ All relations and functions setup completed');

// ===== إحصائيات التحميل =====
const allLoadedModels = Object.keys(db).filter(key => 
  key !== 'Sequelize' && key !== 'sequelize'
);

console.log(`📊 Total models loaded: ${allLoadedModels.length}`);
console.log(`📋 Models: ${allLoadedModels.join(', ')}`);

// إحصائيات إضافية
const coreModelsCount = loadedCoreModels.length;
const securityModelsCount = db.LoginAttempts ? 1 : 0;

console.log(`📈 Core models: ${coreModelsCount}/${coreModels.length}`);
console.log(`🔒 Security models: ${securityModelsCount}/1`);

if (missingCoreModels.length > 0) {
  console.log(`⚠️  Missing core models: ${missingCoreModels.join(', ')}`);
}

if (!db.LoginAttempts) {
  console.log('⚠️  Security features may be limited without LoginAttempts model');
}

// ===== تصدير قاعدة البيانات =====
module.exports = db;