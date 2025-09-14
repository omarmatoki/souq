module.exports = (sequelize, DataTypes) => {
  const Shipping = sequelize.define('Shipping', {
    shipping_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    // إضافة purchase_id للتمييز بين عمليات الشراء المختلفة
    purchase_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      allowNull: false,
      comment: 'Unique identifier for each purchase session'
    },
    // ربط الشحن بالسيشن
    customer_session_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Session ID of the customer'
    },
    // إزالة order_id لأننا سنربط الطلبات بـ purchase_id
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
    },
    identity_images: {
      type: DataTypes.JSON, // يحفظ array من الصور
      allowNull: true,
      comment: 'JSON array containing identity document images (front, back, etc.)'
    },
    // إضافة timestamp لمعرفة متى تم إنشاء معلومات الشحن
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    timestamps: false,
    tableName: 'Shipping',
    indexes: [
      {
        fields: ['purchase_id']
      },
      {
        fields: ['customer_session_id']
      }
    ]
  });
  
  return Shipping;
};