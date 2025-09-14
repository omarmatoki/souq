const Sequelize = require('sequelize');
const sequelize = require('../config/database');

const db = {};
db.Sequelize = Sequelize;
db.sequelize = sequelize;

// ========================================
// 📦 استيراد جميع الموديلات مع معالجة الأخطاء
// ========================================

console.log('🚀 Starting models loading...\n');

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

console.log('\n📦 Models loading completed!\n');

// ========================================
// 🔗 تعريف العلاقات بين الجداول
// ========================================

try {
  console.log('🔗 Starting relations definition...\n');

  // ==========================================
  // 👤 علاقات المستخدم (User Relations)
  // ==========================================
  
  // المستخدم الواحد يملك متاجر متعددة (One-to-Many)
  db.User.hasMany(db.Store, { 
    foreignKey: 'user_id', 
    as: 'stores',
    onDelete: 'CASCADE' 
  });
  // كل متجر ينتمي لمستخدم واحد فقط (Many-to-One)
  db.Store.belongsTo(db.User, { 
    foreignKey: 'user_id',
    as: 'owner'
  });
  console.log('✅ User ↔ Store relations defined');

  // ==========================================
  // 🏬 علاقات المتجر (Store Relations)
  // ==========================================

  // المتجر الواحد يحتوي على منتجات متعددة (One-to-Many)
  db.Store.hasMany(db.Product, { 
    foreignKey: 'store_id', 
    as: 'products',
    onDelete: 'CASCADE' 
  });
  // كل منتج ينتمي لمتجر واحد فقط (Many-to-One)
  db.Product.belongsTo(db.Store, { 
    foreignKey: 'store_id',
    as: 'store'
  });
  console.log('✅ Store ↔ Product relations defined');

  // المتجر يستقبل طلبات متعددة من المشترين (One-to-Many)
  db.Store.hasMany(db.Order, { 
    foreignKey: 'store_id', 
    as: 'orders',
    onDelete: 'CASCADE' 
  });
  // كل طلب موجه لمتجر واحد فقط (Many-to-One)
  db.Order.belongsTo(db.Store, { 
    foreignKey: 'store_id',
    as: 'store'
  });
  console.log('✅ Store ↔ Order relations defined');

  // ==========================================
  // 📋 علاقات الطلب (Order Relations)
  // ==========================================

  // الطلب الواحد يحتوي على عناصر متعددة (One-to-Many)
  // مثال: طلب واحد = (منتج أ × 2) + (منتج ب × 1) + (منتج ج × 3)
  db.Order.hasMany(db.OrderItem, { 
    foreignKey: 'order_id', 
    as: 'orderItems',
    onDelete: 'CASCADE' 
  });
  // كل عنصر طلب ينتمي لطلب واحد فقط (Many-to-One)
  db.OrderItem.belongsTo(db.Order, { 
    foreignKey: 'order_id',
    as: 'order'
  });
  console.log('✅ Order ↔ OrderItem relations defined');

  // ==========================================
  // 📦 علاقات المنتج (Product Relations)
  // ==========================================

  // المنتج الواحد يمكن أن يطلبه عملاء مختلفون في طلبات مختلفة (One-to-Many)
  db.Product.hasMany(db.OrderItem, { 
    foreignKey: 'product_id', 
    as: 'orderItems',
    onDelete: 'CASCADE' 
  });
  // كل عنصر طلب يحتوي على منتج واحد فقط (Many-to-One)
  db.OrderItem.belongsTo(db.Product, { 
    foreignKey: 'product_id',
    as: 'product'
  });
  console.log('✅ Product ↔ OrderItem relations defined');

  // ==========================================
  // 🛒 علاقات السلة (Cart Relations)
  // ==========================================

  // السلة الواحدة تحتوي على عناصر متعددة (One-to-Many)
  db.Cart.hasMany(db.CartItem, { 
    foreignKey: 'cart_id', 
    as: 'cartItems',
    onDelete: 'CASCADE' 
  });
  // كل عنصر سلة ينتمي لسلة واحدة فقط (Many-to-One)
  db.CartItem.belongsTo(db.Cart, { 
    foreignKey: 'cart_id',
    as: 'cart'
  });
  console.log('✅ Cart ↔ CartItem relations defined');

  // المنتج يمكن أن يُضاف لسلال تسوق متعددة (One-to-Many)
  db.Product.hasMany(db.CartItem, { 
    foreignKey: 'product_id', 
    as: 'cartItems',
    onDelete: 'CASCADE' 
  });
  // كل عنصر سلة يحتوي على منتج واحد (Many-to-One)
  db.CartItem.belongsTo(db.Product, { 
    foreignKey: 'product_id',
    as: 'product'
  });
  console.log('✅ Product ↔ CartItem relations defined');

  // ==========================================
  // ⭐ علاقات التقييمات (Review Relations)
  // ==========================================

  // المنتج يحصل على تقييمات متعددة من المشترين (One-to-Many)
  db.Product.hasMany(db.Review, { 
    foreignKey: 'product_id',
    as: 'reviews',               // اسم مستعار للعلاقة
    onDelete: 'CASCADE',
    scope: {
      review_type: 'product'     // فلترة: فقط تقييمات المنتجات
    }
  });
  // كل تقييم منتج ينتمي لمنتج واحد (Many-to-One)
  db.Review.belongsTo(db.Product, { 
    foreignKey: 'product_id',
    as: 'product'
  });
  console.log('✅ Product ↔ Review relations defined');

  // المتجر يحصل على تقييمات مباشرة (تقييم الخدمة، السرعة، إلخ) (One-to-Many)
  db.Store.hasMany(db.Review, { 
    foreignKey: 'store_id',
    as: 'storeReviews',          // تقييمات المتجر المباشرة فقط
    onDelete: 'CASCADE',
    scope: {
      review_type: 'store'       // فقط تقييمات المتاجر
    }
  });
  // كل تقييم متجر ينتمي لمتجر واحد (Many-to-One)
  db.Review.belongsTo(db.Store, { 
    foreignKey: 'store_id',
    as: 'store'
  });
  console.log('✅ Store ↔ Review (direct) relations defined');

  // المتجر مع جميع التقييمات (المتجر نفسه + منتجاته) (One-to-Many)
  db.Store.hasMany(db.Review, {
    foreignKey: 'store_id',
    as: 'allStoreReviews',       // جميع التقييمات المرتبطة بالمتجر
    onDelete: 'CASCADE'          // بدون scope = جميع التقييمات
  });
  console.log('✅ Store ↔ Review (all) relations defined');

  console.log('\n🔗 All relations defined successfully!\n');

} catch (error) {
  console.error('❌ Failed to define relations:', error.message);
  console.error('Full error:', error);
}

// ========================================
// 🛠️ الدوال المساعدة المخصصة (Helper Functions)
// ========================================

try {
  console.log('🛠️ Adding helper functions...\n');

  // ==========================================
  // 📋 دوال مساعدة للطلبات (Order Helpers)
  // ==========================================

  /**
   * الحصول على معلومات الشحن للطلب
   * @returns {Object|null} معلومات الشحن أو null
   */
  db.Order.prototype.getShippingInfo = async function() {
    // التأكد من وجود purchase_id
    if (!this.purchase_id) {
      return null;
    }
    
    // البحث عن معلومات الشحن
    return await db.Shipping.findOne({
      where: { purchase_id: this.purchase_id }
    });
  };
  console.log('✅ Order.prototype.getShippingInfo() added');

  /**
   * دالة ثابتة للحصول على الطلبات مع معلومات الشحن
   * @param {Object} whereCondition شروط البحث
   * @returns {Array} مصفوفة الطلبات مع معلومات الشحن
   */
  db.Order.findWithShipping = async function(whereCondition) {
    // البحث عن الطلبات
    const orders = await this.findAll({
      where: whereCondition
    });
    
    // إضافة معلومات الشحن لكل طلب
    for (let order of orders) {
      if (order.purchase_id) {
        // إضافة معلومات الشحن في dataValues
        order.dataValues.ShippingInfo = await db.Shipping.findOne({
          where: { purchase_id: order.purchase_id }
        });
      }
    }
    
    return orders;
  };
  console.log('✅ Order.findWithShipping() added');

  // ==========================================
  // 🚚 دوال مساعدة للشحن (Shipping Helpers)
  // ==========================================

  /**
   * الحصول على معلومات الطلب من معلومات الشحن
   * @returns {Object|null} معلومات الطلب أو null
   */
  db.Shipping.prototype.getOrderInfo = async function() {
    // التأكد من وجود purchase_id
    if (!this.purchase_id) {
      return null;
    }
    
    // البحث عن معلومات الطلب
    return await db.Order.findOne({
      where: { purchase_id: this.purchase_id }
    });
  };
  console.log('✅ Shipping.prototype.getOrderInfo() added');

  // ==========================================
  // 🏬 دوال مساعدة للمتاجر (Store Helpers)
  // ==========================================

  /**
   * دالة للحصول على تقييمات منتجات المتجر عبر المنتجات
   * @returns {Array} مصفوفة تقييمات منتجات المتجر
   */
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
  console.log('✅ Store.prototype.getProductReviews() added');

  console.log('\n🛠️ All helper functions added successfully!\n');

} catch (error) {
  console.error('❌ Failed to add helper functions:', error.message);
  console.error('Full error:', error);
}

// ========================================
// 📊 إحصائيات التحميل والمراقبة
// ========================================

const modelCount = Object.keys(db).filter(key => 
  key !== 'Sequelize' && key !== 'sequelize'
).length;

const modelNames = Object.keys(db).filter(key => 
  key !== 'Sequelize' && key !== 'sequelize'
);

console.log('='.repeat(50));
console.log('📊 DATABASE MODELS SUMMARY');
console.log('='.repeat(50));
console.log(`📈 Total models loaded: ${modelCount}`);
console.log(`📋 Models: ${modelNames.join(', ')}`);
console.log(`🔗 Relations: 15+ defined relationships`);
console.log(`🛠️ Helper functions: 4 custom functions added`);
console.log(`⭐ Review types: product, store`);
console.log('='.repeat(50));
console.log('🚀 Database models initialization completed successfully!');
console.log('='.repeat(50));

module.exports = db;