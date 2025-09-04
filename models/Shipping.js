module.exports = (sequelize, DataTypes) => {
  const Shipping = sequelize.define('Shipping', {
    shipping_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    order_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Orders',
        key: 'order_id'
      }
    },
    // معلومات المشتري الكاملة
    customer_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    customer_phone: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    customer_whatsapp: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    // معلومات الشحن
    recipient_name: {
      type: DataTypes.STRING(255),
      allowNull: true // قد يكون نفس اسم المشتري
    },
    shipping_address: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    source_address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    destination: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    shipping_method: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    tracking_number: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    shipping_status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'preparing'
    },
    shipped_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    delivered_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    timestamps: false,
    tableName: 'Shipping'
  });
  
  return Shipping;
};

    // التحقق من ملكية المتجر
    // if (order.Store.user_id !== req.user.user_id) {
    //   return res.status(403).json({ error: 'غير مصرح لك بإضافة معلومات شحن لهذا الطلب' });
    // }