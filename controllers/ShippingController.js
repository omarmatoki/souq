const db = require('../models');

// إنشاء معلومات شحن جديدة
exports.createShipping = async (req, res) => {
  try {
    const {
      order_id,
      customer_name,
      customer_phone,
      customer_whatsapp,
      recipient_name,
      shipping_address,
      source_address,
      destination,
      shipping_method
    } = req.body;

    // التحقق من وجود الطلب
    const order = await db.Order.findByPk(order_id, {
      include: [{ model: db.Store, as: 'Store' }]
    });

    if (!order) {
      return res.status(404).json({ error: 'الطلب غير موجود' });
    }

    // التحقق من عدم وجود معلومات شحن مسبقة
    const existingShipping = await db.Shipping.findOne({ where: { order_id } });
    if (existingShipping) {
      return res.status(400).json({ error: 'معلومات الشحن موجودة مسبقاً لهذا الطلب' });
    }

    const shippingData = {
      order_id: parseInt(order_id),
      customer_name,
      customer_phone,
      customer_whatsapp,
      recipient_name: recipient_name || customer_name,
      shipping_address,
      source_address,
      destination,
      shipping_method: shipping_method || 'standard',
      shipping_status: 'preparing'
    };

    const shipping = await db.Shipping.create(shippingData);
    res.status(201).json(shipping);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على جميع معلومات الشحن
exports.getAllShipping = async (req, res) => {
  try {
    const { shipping_status, store_id } = req.query;
    let includeWhere = {};
    
    if (store_id) {
      includeWhere.store_id = store_id;
    }

    let whereClause = {};
    if (shipping_status) {
      whereClause.shipping_status = shipping_status;
    }

    const shippings = await db.Shipping.findAll({
      where: whereClause,
      include: [
        {
          model: db.Order,
          as: 'Order',
          where: includeWhere,
          include: [
            {
              model: db.Store,
              as: 'Store',
              attributes: ['store_name', 'logo_image']
            },
            {
              model: db.OrderItem,
              as: 'OrderItems',
              include: [
                {
                  model: db.Product,
                  as: 'Product',
                  attributes: ['name', 'images']
                }
              ]
            }
          ]
        }
      ],
      order: [['shipped_at', 'DESC']]
    });

    // تنسيق صور المنتجات
    const formattedShippings = shippings.map(shipping => {
      if (shipping.Order && shipping.Order.OrderItems) {
        shipping.Order.OrderItems = shipping.Order.OrderItems.map(item => {
          if (item.Product && item.Product.images) {
            item.Product.images = JSON.parse(item.Product.images || '[]');
          }
          return item;
        });
      }
      return shipping;
    });

    res.status(200).json(formattedShippings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على معلومات شحن بواسطة المعرف
exports.getShippingById = async (req, res) => {
  try {
    const shipping = await db.Shipping.findByPk(req.params.id, {
      include: [
        {
          model: db.Order,
          as: 'Order', // ✅ مُحدث من 'order' إلى 'Order'
          include: [
            {
              model: db.Store,
              as: 'Store', // ✅ مُحدث من 'store' إلى 'Store'
              attributes: ['store_name', 'logo_image', 'store_address']
            },
            {
              model: db.OrderItem,
              as: 'OrderItems', // ✅ مُحدث من 'items' إلى 'OrderItems'
              include: [
                {
                  model: db.Product,
                  as: 'Product', // ✅ مُحدث من 'product' إلى 'Product'
                  attributes: ['name', 'images', 'price']
                }
              ]
            }
          ]
        }
      ]
    });

    if (!shipping) {
      return res.status(404).json({ error: 'معلومات الشحن غير موجودة' });
    }

    // تنسيق صور المنتجات
    if (shipping.Order && shipping.Order.OrderItems) { // ✅ أسماء محدثة
      shipping.Order.OrderItems = shipping.Order.OrderItems.map(item => {
        if (item.Product && item.Product.images) {
          item.Product.images = JSON.parse(item.Product.images || '[]');
        }
        return item;
      });
    }

    res.status(200).json(shipping);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// تحديث معلومات الشحن

exports.updateShipping = async (req, res) => {
  try {
    const shipping = await db.Shipping.findByPk(req.params.id, {
      include: [
        {
          model: db.Order,
          as: 'Order', // ✅ مُحدث من 'order' إلى 'Order'
          include: [{ model: db.Store, as: 'Store' }] // ✅ مُحدث من 'store' إلى 'Store'
        }
      ]
    });

    if (!shipping) {
      return res.status(404).json({ error: 'معلومات الشحن غير موجودة' });
    }

    // التحقق من ملكية المتجر
    if (shipping.Order.Store.user_id !== req.user.user_id) { // ✅ أسماء محدثة
      return res.status(403).json({ error: 'غير مصرح لك بتعديل معلومات الشحن لهذا الطلب' });
    }

    const updatedData = { ...req.body };

    await shipping.update(updatedData);
    res.status(200).json(shipping);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// تحديث حالة الشحن
exports.updateShippingStatus = async (req, res) => {
  try {
    const { shipping_status, tracking_number } = req.body;
    const shipping = await db.Shipping.findByPk(req.params.id, {
      include: [
        {
          model: db.Order,
          as: 'Order', // ✅ مُحدث من 'order' إلى 'Order'
          include: [{ model: db.Store, as: 'Store' }] // ✅ مُحدث من 'store' إلى 'Store'
        }
      ]
    });

    if (!shipping) {
      return res.status(404).json({ error: 'معلومات الشحن غير موجودة' });
    }

    // التحقق من ملكية المتجر
    if (shipping.Order.Store.user_id !== req.user.user_id) { // ✅ أسماء محدثة
      return res.status(403).json({ error: 'غير مصرح لك بتعديل حالة الشحن لهذا الطلب' });
    }

    const validStatuses = ['preparing', 'shipped', 'in_transit', 'delivered', 'returned'];
    if (!validStatuses.includes(shipping_status)) {
      return res.status(400).json({ error: 'حالة الشحن غير صالحة' });
    }

    const updateData = { shipping_status };

    // تحديث التواريخ بناءً على الحالة
    if (shipping_status === 'shipped' && !shipping.shipped_at) {
      updateData.shipped_at = new Date();
    }

    if (shipping_status === 'delivered' && !shipping.delivered_at) {
      updateData.delivered_at = new Date();
    }

    if (tracking_number) {
      updateData.tracking_number = tracking_number;
    }

    await shipping.update(updateData);

    // تحديث حالة الطلب المرتبط
    if (shipping_status === 'shipped') {
      await shipping.Order.update({ status: 'shipped' }); // ✅ اسم محدث
    } else if (shipping_status === 'delivered') {
      await shipping.Order.update({ status: 'delivered' }); // ✅ اسم محدث
    }

    res.status(200).json({ 
      message: 'تم تحديث حالة الشحن بنجاح', 
      shipping 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// حذف معلومات الشحن
exports.deleteShipping = async (req, res) => {
  try {
    const shipping = await db.Shipping.findByPk(req.params.id, {
      include: [
        {
          model: db.Order,
          as: 'Order', // ✅ مُحدث من 'order' إلى 'Order'
          include: [{ model: db.Store, as: 'Store' }] // ✅ مُحدث من 'store' إلى 'Store'
        }
      ]
    });

    if (!shipping) {
      return res.status(404).json({ error: 'معلومات الشحن غير موجودة' });
    }

    // التحقق من ملكية المتجر
    if (shipping.Order.Store.user_id !== req.user.user_id) { // ✅ أسماء محدثة
      return res.status(403).json({ error: 'غير مصرح لك بحذف معلومات الشحن لهذا الطلب' });
    }

    // يمكن حذف معلومات الشحن فقط إذا لم يتم شحن الطلب بعد
    if (['shipped', 'in_transit', 'delivered'].includes(shipping.shipping_status)) {
      return res.status(400).json({ error: 'لا يمكن حذف معلومات الشحن بعد الشحن' });
    }

    await shipping.destroy();
    res.status(200).json({ message: 'تم حذف معلومات الشحن بنجاح' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// تتبع الشحنة بواسطة رقم التتبع
exports.trackShipment = async (req, res) => {
  try {
    const { tracking_number } = req.params;

    const shipping = await db.Shipping.findOne({
      where: { tracking_number },
      include: [
        {
          model: db.Order,
          as: 'Order', // ✅ مُحدث من 'order' إلى 'Order'
          include: [
            {
              model: db.Store,
              as: 'Store', // ✅ مُحدث من 'store' إلى 'Store'
              attributes: ['store_name', 'logo_image']
            },
            {
              model: db.OrderItem,
              as: 'OrderItems', // ✅ مُحدث من 'items' إلى 'OrderItems'
              include: [
                {
                  model: db.Product,
                  as: 'Product', // ✅ مُحدث من 'product' إلى 'Product'
                  attributes: ['name', 'images']
                }
              ]
            }
          ]
        }
      ]
    });

    if (!shipping) {
      return res.status(404).json({ error: 'رقم التتبع غير صحيح' });
    }

    // تنسيق صور المنتجات
    if (shipping.Order && shipping.Order.OrderItems) { // ✅ أسماء محدثة
      shipping.Order.OrderItems = shipping.Order.OrderItems.map(item => {
        if (item.Product && item.Product.images) {
          item.Product.images = JSON.parse(item.Product.images || '[]');
        }
        return item;
      });
    }

    res.status(200).json(shipping);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على شحنات متجر معين
exports.getStoreShippings = async (req, res) => {
  try {
    const { store_id } = req.params;
    const { shipping_status } = req.query;

    // التحقق من ملكية المتجر
    const store = await db.Store.findByPk(store_id);
    if (!store) {
      return res.status(404).json({ error: 'المتجر غير موجود' });
    }

    if (store.user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'غير مصرح لك بعرض شحنات هذا المتجر' });
    }

    let whereClause = {};
    if (shipping_status) {
      whereClause.shipping_status = shipping_status;
    }

    const shippings = await db.Shipping.findAll({
      where: whereClause,
      include: [
        {
          model: db.Order,
          as: 'Order', // ✅ مُحدث من 'order' إلى 'Order'
          where: { store_id },
          include: [
            {
              model: db.OrderItem,
              as: 'OrderItems', // ✅ مُحدث من 'items' إلى 'OrderItems'
              include: [
                {
                  model: db.Product,
                  as: 'Product', // ✅ مُحدث من 'product' إلى 'Product'
                  attributes: ['name', 'images']
                }
              ]
            }
          ]
        }
      ],
      order: [['shipped_at', 'DESC']]
    });

    // تنسيق صور المنتجات
    const formattedShippings = shippings.map(shipping => {
      if (shipping.Order && shipping.Order.OrderItems) { // ✅ أسماء محدثة
        shipping.Order.OrderItems = shipping.Order.OrderItems.map(item => {
          if (item.Product && item.Product.images) {
            item.Product.images = JSON.parse(item.Product.images || '[]');
          }
          return item;
        });
      }
      return shipping;
    });

    res.status(200).json(formattedShippings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};