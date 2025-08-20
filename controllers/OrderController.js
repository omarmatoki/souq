const db = require('../models');

// إنشاء طلب جديد
exports.createOrder = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    const { store_id, items, shipping_info } = req.body;
    
    // التحقق من وجود المتجر
    const store = await db.Store.findByPk(store_id);
    if (!store) {
      await transaction.rollback();
      return res.status(404).json({ error: 'المتجر غير موجود' });
    }

    // التحقق من وجود المنتجات وحساب السعر الإجمالي
    let total_price = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await db.Product.findByPk(item.product_id);
      if (!product) {
        await transaction.rollback();
        return res.status(404).json({ error: `المنتج بالمعرف ${item.product_id} غير موجود` });
      }

      if (product.stock_quantity < item.quantity) {
        await transaction.rollback();
        return res.status(400).json({ error: `المخزون غير كافي للمنتج ${product.name}` });
      }

      const itemTotal = product.price * item.quantity;
      total_price += itemTotal;

      orderItems.push({
        product_id: item.product_id,
        quantity: item.quantity,
        price_at_time: product.price
      });
    }

    // إنشاء الطلب
    const order = await db.Order.create({
      store_id,
      total_price,
      status: 'pending'
    }, { transaction });

    // إضافة عناصر الطلب
    for (const item of orderItems) {
      await db.OrderItem.create({
        order_id: order.order_id,
        ...item
      }, { transaction });

      // تحديث المخزون
      const product = await db.Product.findByPk(item.product_id);
      await product.update({
        stock_quantity: product.stock_quantity - item.quantity
      }, { transaction });
    }

    // إنشاء معلومات الشحن إذا تم توفيرها
    if (shipping_info) {
      await db.Shipping.create({
        order_id: order.order_id,
        customer_name: shipping_info.customer_name,
        customer_phone: shipping_info.customer_phone,
        customer_whatsapp: shipping_info.customer_whatsapp,
        recipient_name: shipping_info.recipient_name || shipping_info.customer_name,
        shipping_address: shipping_info.shipping_address,
        destination: shipping_info.destination,
        shipping_method: shipping_info.shipping_method || 'standard'
      }, { transaction });
    }

    await transaction.commit();

    // إرجاع الطلب مع التفاصيل
    const orderWithDetails = await db.Order.findByPk(order.order_id, {
      include: [
        {
          model: db.OrderItem,
          as: 'OrderItems',
          include: [{ model: db.Product, as: 'Product' }]
        },
        { model: db.Shipping, as: 'Shipping' }
      ]
    });

    res.status(201).json(orderWithDetails);
  } catch (error) {
    await transaction.rollback();
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على جميع الطلبات
exports.getAllOrders = async (req, res) => {
  try {
    const { status, store_id } = req.query;
    let whereClause = {};

    if (status) {
      whereClause.status = status;
    }

    if (store_id) {
      whereClause.store_id = store_id;
    }

    const orders = await db.Order.findAll({
      where: whereClause,
      include: [
        {
          model: db.Store,
          as: 'Store',
          attributes: ['store_name', 'logo_image']
        },
        {
          model: db.OrderItem,
          as: 'OrderItems',
          include: [{ model: db.Product, as: 'Product' }]
        },
        { model: db.Shipping, as: 'Shipping' }
      ],
      order: [['created_at', 'DESC']]
    });

    res.status(200).json(orders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على طلب بواسطة المعرف
exports.getOrderById = async (req, res) => {
  try {
    const order = await db.Order.findByPk(req.params.id, {
      include: [
        {
          model: db.Store,
          as: 'Store',
          attributes: ['store_name', 'logo_image', 'store_address']
        },
        {
          model: db.OrderItem,
          as: 'OrderItems',
          include: [{ model: db.Product, as: 'Product' }]
        },
        { model: db.Shipping, as: 'Shipping' }
      ]
    });

    if (!order) {
      return res.status(404).json({ error: 'الطلب غير موجود' });
    }

    res.status(200).json(order);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// تحديث حالة الطلب
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const order = await db.Order.findByPk(req.params.id, {
      include: [{ model: db.Store, as: 'Store' }]
    });

    if (!order) {
      return res.status(404).json({ error: 'الطلب غير موجود' });
    }

    // التحقق من ملكية المتجر
    if (order.Store.user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'غير مصرح لك بتعديل هذا الطلب' });
    }

    const validStatuses = ['pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'حالة الطلب غير صالحة' });
    }

    await order.update({ status });
    res.status(200).json({ message: 'تم تحديث حالة الطلب بنجاح', order });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على طلبات المتجر
exports.getStoreOrders = async (req, res) => {
  try {
    const { store_id } = req.params;
    const { status } = req.query;

    // التحقق من ملكية المتجر
    const store = await db.Store.findByPk(store_id);
    if (!store) {
      return res.status(404).json({ error: 'المتجر غير موجود' });
    }

    if (store.user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'غير مصرح لك بعرض طلبات هذا المتجر' });
    }

    let whereClause = { store_id };
    if (status) {
      whereClause.status = status;
    }

    const orders = await db.Order.findAll({
      where: whereClause,
      include: [
        {
          model: db.OrderItem,
          as: 'OrderItems',
          include: [{ model: db.Product, as: 'Product' }]
        },
        { model: db.Shipping, as: 'Shipping' }
      ],
      order: [['created_at', 'DESC']]
    });

    res.status(200).json(orders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// حذف طلب
exports.deleteOrder = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    const order = await db.Order.findByPk(req.params.id, {
      include: [
        { model: db.Store, as: 'Store' },
        { model: db.OrderItem, as: 'OrderItems' }
      ]
    });

    if (!order) {
      await transaction.rollback();
      return res.status(404).json({ error: 'الطلب غير موجود' });
    }

    // التحقق من ملكية المتجر
    if (order.Store.user_id !== req.user.user_id) {
      await transaction.rollback();
      return res.status(403).json({ error: 'غير مصرح لك بحذف هذا الطلب' });
    }

    // يمكن حذف الطلب فقط إذا كان في حالة pending أو cancelled
    if (!['pending', 'cancelled'].includes(order.status)) {
      await transaction.rollback();
      return res.status(400).json({ error: 'لا يمكن حذف طلب في هذه الحالة' });
    }

    // إرجاع المنتجات للمخزون إذا كان الطلب pending
    if (order.status === 'pending') {
      for (const item of order.OrderItems) {
        const product = await db.Product.findByPk(item.product_id);
        await product.update({
          stock_quantity: product.stock_quantity + item.quantity
        }, { transaction });
      }
    }

    await order.destroy({ transaction });
    await transaction.commit();
    
    res.status(200).json({ message: 'تم حذف الطلب بنجاح' });
  } catch (error) {
    await transaction.rollback();
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// إنشاء طلب مبرمج (للمسؤولين)
exports.createProgrammaticOrder = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    const { store_id, items } = req.body;
    
    // التحقق من صلاحية المسؤول
    if (req.user.role !== 'admin') {
      await transaction.rollback();
      return res.status(403).json({ error: 'غير مصرح لك بإنشاء طلبات مبرمجة' });
    }

    // التحقق من وجود المتجر
    const store = await db.Store.findByPk(store_id);
    if (!store) {
      await transaction.rollback();
      return res.status(404).json({ error: 'المتجر غير موجود' });
    }

    let total_price = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await db.Product.findByPk(item.product_id);
      if (!product) {
        await transaction.rollback();
        return res.status(404).json({ error: `المنتج بالمعرف ${item.product_id} غير موجود` });
      }

      const itemTotal = product.price * item.quantity;
      total_price += itemTotal;

      orderItems.push({
        product_id: item.product_id,
        quantity: item.quantity,
        price_at_time: product.price
      });
    }

    // إنشاء الطلب المبرمج
    const order = await db.Order.create({
      store_id,
      total_price,
      status: 'confirmed',
      is_programmatic: true
    }, { transaction });

    // إضافة عناصر الطلب
    for (const item of orderItems) {
      await db.OrderItem.create({
        order_id: order.order_id,
        ...item
      }, { transaction });
    }

    await transaction.commit();

    // إرجاع الطلب مع التفاصيل
    const orderWithDetails = await db.Order.findByPk(order.order_id, {
      include: [
        {
          model: db.OrderItem,
          as: 'OrderItems',
          include: [{ model: db.Product, as: 'Product' }]
        }
      ]
    });

    res.status(201).json(orderWithDetails);
  } catch (error) {
    await transaction.rollback();
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};