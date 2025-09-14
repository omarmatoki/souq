module.exports = (sequelize, DataTypes) => {
  const Order = sequelize.define('Order', {
    order_id: {
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
    // تعديل purchase_id ليصبح اختياري - سيتم ملؤه بعد نجاح الدفع
    purchase_id: {
      type: DataTypes.UUID,
      allowNull: true, // ← التغيير الوحيد من false إلى true
      comment: 'Will be filled after successful payment'
    },
    // الاحتفاظ بـ customer_session_id للاستعلام السريع
    customer_session_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Session ID of the customer who placed the order'
    },
    total_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'pending'
    },
    is_programmatic: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    settlement_status: {
      type: DataTypes.ENUM('not_settled', 'settlement_requested', 'settled'),
      allowNull: false,
      defaultValue: 'not_settled',
      comment: 'Settlement status: not_settled = غير مصفر, settlement_requested = تم الطلب, settled = تم التصفير'
    },
    // إضافة تاريخ طلب التصفير
    settlement_requested_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Date when settlement was requested by merchant'
    },
    // إضافة تاريخ الموافقة على التصفير
    settled_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Date when settlement was approved by admin'
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    timestamps: false,
    tableName: 'Orders',
    indexes: [
      {
        fields: ['purchase_id']
      },
      {
        fields: ['customer_session_id']
      },
      {
        fields: ['store_id']
      }
    ]
  });
  
  return Order;
};