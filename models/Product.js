module.exports = (sequelize, DataTypes) => {
  const Product = sequelize.define('Product', {
    product_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    store_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Stores',
        key: 'store_id'
      }
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    discount_percentage: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      defaultValue: null,
      validate: {
        min: 0,
        max: 100
      },
      comment: 'نسبة الخصم بالمئة (0-100)'
    },
    stock_quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    images: {
      type: DataTypes.JSON,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    timestamps: false,
    tableName: 'Products',
    
    // إضافة دوال مخصصة للمودل
    instanceMethods: {
      // دالة حساب السعر بعد الخصم
      getDiscountedPrice: function() {
        if (this.discount_percentage && this.discount_percentage > 0) {
          const discountAmount = (parseFloat(this.price) * parseFloat(this.discount_percentage)) / 100;
          return parseFloat(this.price) - discountAmount;
        }
        return parseFloat(this.price);
      },
      
      // دالة حساب مقدار الخصم بالعملة
      getDiscountAmount: function() {
        if (this.discount_percentage && this.discount_percentage > 0) {
          return (parseFloat(this.price) * parseFloat(this.discount_percentage)) / 100;
        }
        return 0;
      },
      
      // دالة للتحقق من وجود خصم
      hasDiscount: function() {
        return this.discount_percentage && this.discount_percentage > 0;
      }
    }
  });
  
  // إضافة دوال كـ Instance Methods (الطريقة الحديثة)
  Product.prototype.getDiscountedPrice = function() {
    if (this.discount_percentage && this.discount_percentage > 0) {
      const discountAmount = (parseFloat(this.price) * parseFloat(this.discount_percentage)) / 100;
      return parseFloat(this.price) - discountAmount;
    }
    return parseFloat(this.price);
  };
  
  Product.prototype.getDiscountAmount = function() {
    if (this.discount_percentage && this.discount_percentage > 0) {
      return (parseFloat(this.price) * parseFloat(this.discount_percentage)) / 100;
    }
    return 0;
  };
  
  Product.prototype.hasDiscount = function() {
    return this.discount_percentage && this.discount_percentage > 0;
  };
  
  // إضافة Virtual Field للسعر بعد الخصم
  Product.prototype.toJSON = function() {
    const values = Object.assign({}, this.get());
    
    // إضافة السعر بعد الخصم كحقل افتراضي
    values.discounted_price = this.getDiscountedPrice();
    values.discount_amount = this.getDiscountAmount();
    values.has_discount = this.hasDiscount();
    
    return values;
  };
  
  return Product;
};