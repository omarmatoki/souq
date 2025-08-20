module.exports = (sequelize, DataTypes) => {
  const Store = sequelize.define('Stores', {
    store_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'user_id'
      }
    },
    store_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
     store_address: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    images: {
      type: DataTypes.JSON,
      allowNull: true
    },
    logo_image: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  },  {
    timestamps: false,
    tableName: 'Stores'
  });
  return Store;
};