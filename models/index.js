const Sequelize = require('sequelize');
const sequelize = require('../config/database');

const db = {};
db.Sequelize = Sequelize;
db.sequelize = sequelize;

// استيراد جميع الموديلات بالأسماء الصحيحة
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

// تعريف العلاقات بين الجداول
try {
  // ========== العلاقات الأساسية (بدون تغيير) ==========
  
  // علاقة المستخدم مع المتاجر (التاجر يملك متاجر متعددة)
  db.User.hasMany(db.Store, { 
    foreignKey: 'user_id', 
    onDelete: 'CASCADE' 
  });
  db.Store.belongsTo(db.User, { 
    foreignKey: 'user_id' 
  });

  // علاقة المتجر مع المنتجات (المتجر يحتوي على منتجات متعددة)
  db.Store.hasMany(db.Product, { 
    foreignKey: 'store_id', 
    onDelete: 'CASCADE' 
  });
  db.Product.belongsTo(db.Store, { 
    foreignKey: 'store_id' 
  });

  // علاقة المتجر مع الطلبات (المتجر يستقبل طلبات متعددة من المشترين)
  db.Store.hasMany(db.Order, { 
    foreignKey: 'store_id', 
    onDelete: 'CASCADE' 
  });
  db.Order.belongsTo(db.Store, { 
    foreignKey: 'store_id' 
  });

  // علاقة الطلب مع عناصر الطلب (الطلب يحتوي على عناصر متعددة)
  db.Order.hasMany(db.OrderItem, { 
    foreignKey: 'order_id', 
    onDelete: 'CASCADE' 
  });
  db.OrderItem.belongsTo(db.Order, { 
    foreignKey: 'order_id' 
  });

  // علاقة المنتج مع عناصر الطلب (المنتج يمكن أن يكون في طلبات متعددة)
  db.Product.hasMany(db.OrderItem, { 
    foreignKey: 'product_id', 
    onDelete: 'CASCADE' 
  });
  db.OrderItem.belongsTo(db.Product, { 
    foreignKey: 'product_id' 
  });

  // علاقة السلة مع عناصر السلة (السلة تحتوي على عناصر متعددة)
  db.Cart.hasMany(db.CartItem, { 
    foreignKey: 'cart_id', 
    onDelete: 'CASCADE' 
  });
  db.CartItem.belongsTo(db.Cart, { 
    foreignKey: 'cart_id' 
  });

  // علاقة المنتج مع عناصر السلة (المنتج يمكن أن يكون في سلال متعددة)
  db.Product.hasMany(db.CartItem, { 
    foreignKey: 'product_id', 
    onDelete: 'CASCADE' 
  });
  db.CartItem.belongsTo(db.Product, { 
    foreignKey: 'product_id' 
  });

 
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
    
    // إضافة معلومات الشحن لكل طلب
    for (let order of orders) {
      if (order.purchase_id) {
        order.dataValues.ShippingInfo = await db.Shipping.findOne({
          where: { purchase_id: order.purchase_id }
        });
      }
    }
    
    return orders;
  };

  // ========== علاقات التقييمات (بدون تغيير) ==========
  
  // علاقة المنتج مع التقييمات (المنتج يحصل على تقييمات من المشترين)
  db.Product.hasMany(db.Review, { 
    foreignKey: 'product_id',
    as: 'reviews',
    onDelete: 'CASCADE',
    scope: {
      review_type: 'product'  // فقط تقييمات المنتجات
    }
  });
  db.Review.belongsTo(db.Product, { 
    foreignKey: 'product_id',
    as: 'product'
  });

  // علاقة المتجر مع التقييمات المباشرة (تقييمات المتجر نفسه)
  db.Store.hasMany(db.Review, { 
    foreignKey: 'store_id',
    as: 'storeReviews',
    onDelete: 'CASCADE',
    scope: {
      review_type: 'store'  // فقط تقييمات المتاجر
    }
  });
  db.Review.belongsTo(db.Store, { 
    foreignKey: 'store_id',
    as: 'store'
  });

  // علاقة إضافية: المتجر مع جميع التقييمات (تقييمات المتجر + تقييمات منتجاته)
  db.Store.hasMany(db.Review, {
    foreignKey: 'store_id',
    as: 'allStoreReviews',
    onDelete: 'CASCADE'
  });

  // علاقة للحصول على تقييمات منتجات المتجر عبر المنتجات
  db.Store.hasManyThrough = function() {
    return db.Review.findAll({
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

  console.log('✅ All relations defined successfully');

} catch (error) {
  console.error('❌ Failed to define relations:', error.message);
  console.error('Full error:', error);
}

const modelCount = Object.keys(db).filter(key => 
  key !== 'Sequelize' && key !== 'sequelize'
).length;

console.log(`📊 Total models loaded: ${modelCount}`);
console.log(`📋 Models: ${Object.keys(db).filter(key => 
  key !== 'Sequelize' && key !== 'sequelize'
).join(', ')}`);

module.exports = db;