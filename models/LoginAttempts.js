module.exports = (sequelize, DataTypes) => {
  const LoginAttempts = sequelize.define('LoginAttempts', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    identifier: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'username_ip for tracking'
    },
    username: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Username attempted'
    },
    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: true,
      comment: 'IP address'
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Browser info'
    },
    failed_attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Failed attempt count'
    },
    last_attempt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Last attempt time'
    },
    locked_until: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Lock expiry time'
    },
    lock_reason: {
      type: DataTypes.ENUM('max_attempts', 'suspicious_activity', 'manual_lock'),
      allowNull: true,
      defaultValue: 'max_attempts'
    },
    unlock_method: {
      type: DataTypes.ENUM('auto_expire', 'admin_unlock', 'password_reset'),
      allowNull: true
    },
    unlocked_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Admin user_id - no FK constraint'
    },
    unlocked_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    success_login_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  }, {
    tableName: 'login_attempts',
    timestamps: true,
    indexes: [
      {
        fields: ['identifier']
      },
      {
        fields: ['username']
      },
      {
        fields: ['ip_address']
      },
      {
        fields: ['locked_until']
      },
      {
        fields: ['is_active']
      }
    ]
  });

  // دوال مساعدة
  LoginAttempts.prototype.isLocked = function() {
    return this.locked_until && this.locked_until > new Date();
  };

  LoginAttempts.prototype.getRemainingLockTime = function() {
    if (!this.isLocked()) return 0;
    return Math.ceil((this.locked_until - new Date()) / 1000 / 60);
  };

  LoginAttempts.findByIdentifier = async function(identifier) {
    return await this.findOne({
      where: { identifier, is_active: true },
      order: [['updatedAt', 'DESC']]
    });
  };

  LoginAttempts.cleanupExpired = async function() {
    const now = new Date();
    return await this.update(
      { is_active: false },
      {
        where: {
          locked_until: { [sequelize.Sequelize.Op.lt]: now },
          is_active: true
        }
      }
    );
  };

  return LoginAttempts;
};