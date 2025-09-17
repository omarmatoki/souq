module.exports = (sequelize, DataTypes) => {
  const Review = sequelize.define('Review', {
    review_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    // يمكن ربط التقييم بالمنتج أو المتجر (أحدهما فقط)
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Products',
        key: 'product_id'
      }
    },
    store_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Stores',
        key: 'store_id'
      }
    },
    // ربط التقييم بالزائر
    session_id: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    // نوع التقييم
    review_type: {
      type: DataTypes.ENUM('product', 'store'),
      allowNull: false
    },
    // معلومات المراجع
    reviewer_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    reviewer_phone: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    rating: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 1,
        max: 5
      }
    },
    comment: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    is_verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    timestamps: false,
    tableName: 'Reviews',
    // فاليديشن بسيط
    validate: {
      eitherProductOrStore() {
        if ((this.product_id && this.store_id) || (!this.product_id && !this.store_id)) {
          throw new Error('يجب تحديد إما product_id أو store_id وليس كلاهما');
        }
        
        if (this.review_type === 'product' && !this.product_id) {
          throw new Error('يجب تحديد product_id عند review_type = product');
        }
        
        if (this.review_type === 'store' && !this.store_id) {
          throw new Error('يجب تحديد store_id عند review_type = store');
        }
      }
    }
  });
  
  return Review;
};