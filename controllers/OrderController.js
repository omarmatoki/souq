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

// التابع الأول: جلب جميع الطلبات مع إحصائيات الحالة
// التابع الأول: جلب جميع الطلبات مع إحصائيات الحالة لمتجر معين
// التابع الأول: جلب جميع الطلبات مع إحصائيات الحالة لمتجر معين
exports.getAllOrdersWithStats = async (req, res) => {
  try {
    const storeId = req.params.store_id;

    // التحقق من وجود store_id
    if (!storeId) {
      return res.status(400).json({ error: 'معرف المتجر مطلوب' });
    }

    // جلب جميع الطلبات للمتجر المحدد
    const allOrders = await db.Order.findAll({
      where: { store_id: storeId },
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
      ],
      order: [['created_at', 'DESC']]
    });

    // جلب الطلبات المشحونة فقط للمتجر المحدد
    const shippedOrders = await db.Order.findAll({
      where: { 
        store_id: storeId,
        status: 'shipped' 
      },
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
      ],
      order: [['created_at', 'DESC']]
    });

    // جلب الطلبات غير المشحونة للمتجر المحدد
    const unshippedOrders = await db.Order.findAll({
      where: { 
        store_id: storeId,
        status: {
          [db.Sequelize.Op.ne]: 'shipped' // جميع الحالات ما عدا مشحونة
        }
      },
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
      ],
      order: [['created_at', 'DESC']]
    });

    // التحقق من وجود طلبات للمتجر
    if (allOrders.length === 0) {
      return res.status(200).json({
        message: 'لا توجد طلبات لهذا المتجر',
        storeId: storeId,
        allOrders: { orders: [], count: 0, totalAmount: 0 },
        shippedOrders: { orders: [], count: 0, totalAmount: 0 },
        unshippedOrders: { orders: [], count: 0, totalAmount: 0 },
        statistics: {
          totalOrders: 0,
          shippedCount: 0,
          unshippedCount: 0,
          shippedPercentage: 0,
          unshippedPercentage: 0,
          totalRevenue: 0,
          shippedRevenue: 0,
          unshippedRevenue: 0,
          averageOrderValue: 0,
          revenuePercentageShipped: 0,
          revenuePercentageUnshipped: 0
        }
      });
    }

    // حساب إجمالي المبالغ
    const totalAllOrdersAmount = allOrders.reduce((sum, order) => {
      return sum + parseFloat(order.total_price || 0);
    }, 0);

    const totalShippedOrdersAmount = shippedOrders.reduce((sum, order) => {
      return sum + parseFloat(order.total_price || 0);
    }, 0);

    const totalUnshippedOrdersAmount = unshippedOrders.reduce((sum, order) => {
      return sum + parseFloat(order.total_price || 0);
    }, 0);

    // إعداد البيانات مع الإحصائيات
    const response = {
      storeId: parseInt(storeId),
      storeName: allOrders[0]?.Store?.store_name || 'غير محدد',
      allOrders: {
        orders: allOrders,
        count: allOrders.length,
        totalAmount: parseFloat(totalAllOrdersAmount.toFixed(2))
      },
      shippedOrders: {
        orders: shippedOrders,
        count: shippedOrders.length,
        totalAmount: parseFloat(totalShippedOrdersAmount.toFixed(2))
      },
      unshippedOrders: {
        orders: unshippedOrders,
        count: unshippedOrders.length,
        totalAmount: parseFloat(totalUnshippedOrdersAmount.toFixed(2))
      },
      statistics: {
        totalOrders: allOrders.length,
        shippedCount: shippedOrders.length,
        unshippedCount: unshippedOrders.length,
        shippedPercentage: allOrders.length > 0 ? ((shippedOrders.length / allOrders.length) * 100).toFixed(2) : 0,
        unshippedPercentage: allOrders.length > 0 ? ((unshippedOrders.length / allOrders.length) * 100).toFixed(2) : 0,
        totalRevenue: parseFloat(totalAllOrdersAmount.toFixed(2)),
        shippedRevenue: parseFloat(totalShippedOrdersAmount.toFixed(2)),
        unshippedRevenue: parseFloat(totalUnshippedOrdersAmount.toFixed(2)),
        averageOrderValue: allOrders.length > 0 ? parseFloat((totalAllOrdersAmount / allOrders.length).toFixed(2)) : 0,
        revenuePercentageShipped: totalAllOrdersAmount > 0 ? ((totalShippedOrdersAmount / totalAllOrdersAmount) * 100).toFixed(2) : 0,
        revenuePercentageUnshipped: totalAllOrdersAmount > 0 ? ((totalUnshippedOrdersAmount / totalAllOrdersAmount) * 100).toFixed(2) : 0
      }
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('خطأ في جلب طلبات المتجر:', error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر أثناء جلب طلبات المتجر' });
  }
};

// التابع الثاني: تغيير حالة الطلب من غير مشحونة إلى مشحونة
exports.updateOrderToShipped = async (req, res) => {
  try {
    const orderId = req.params.id;

    // التحقق من وجود الطلب أولاً
    const order = await db.Order.findByPk(orderId);

    if (!order) {
      return res.status(404).json({ error: 'الطلب غير موجود' });
    }

    // التحقق من أن الطلب ليس مشحوناً بالفعل
    if (order.status === 'shipped') {
      return res.status(400).json({ error: 'الطلب مشحون بالفعل' });
    }

    // تحديث حالة الطلب إلى مشحونة
    await db.Order.update(
      { status: 'shipped' },
      { where: { order_id: orderId } }
    );

    // جلب الطلب المحدث مع بياناته الكاملة
    const updatedOrder = await db.Order.findByPk(orderId, {
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

    res.status(200).json({
      message: 'تم تحديث حالة الطلب إلى مشحون بنجاح',
      order: updatedOrder
    });

  } catch (error) {
    console.error('خطأ في تحديث حالة الطلب:', error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر أثناء تحديث الطلب' });
  }
};

// في ملف OrderController.js
exports.updateStoreShippedOrdersToProgrammatic = async (req, res) => {
  try {
    const storeId = req.params.store_id;

    // التحقق من صحة معرف المتجر
    if (!storeId) {
      return res.status(400).json({ 
        error: 'معرف المتجر مطلوب' 
      });
    }

    // البحث عن آخر طلب مشحون غير مبرمج للمتجر المحدد
    const lastShippedOrder = await db.Order.findOne({
      where: {
        store_id: storeId,
        status: 'shipped',
        is_programmatic: false
      },
      order: [
        ['order_id', 'DESC']  // ترتيب تنازلي للحصول على آخر طلب
      ]
    });

    // التحقق من وجود طلبات تتطابق مع الشروط
    if (!lastShippedOrder) {
      return res.status(404).json({ 
        error: 'لا توجد طلبات مشحونة غير مبرمجة لهذا المتجر' 
      });
    }

    // جلب جميع الطلبات المشحونة غير المبرمجة من آخر طلب وما قبله
    const ordersToUpdate = await db.Order.findAll({
      where: {
        store_id: storeId,
        status: 'shipped',
        is_programmatic: false,
        order_id: {
          [db.Sequelize.Op.lte]: lastShippedOrder.order_id  // أقل من أو يساوي آخر طلب
        }
      },
      order: [
        ['order_id', 'DESC']
      ]
    });

    // تحديث جميع هذه الطلبات
    const updateResult = await db.Order.update(
      { is_programmatic: true },
      { 
        where: {
          store_id: storeId,
          status: 'shipped',
          is_programmatic: false,
          order_id: {
            [db.Sequelize.Op.lte]: lastShippedOrder.order_id
          }
        }
      }
    );

    // جلب الطلبات المحدثة مع بياناتها الكاملة
    const updatedOrders = await db.Order.findAll({
      where: {
        store_id: storeId,
        status: 'shipped',
        is_programmatic: true,
        order_id: {
          [db.Sequelize.Op.lte]: lastShippedOrder.order_id
        }
      },
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
      ],
      order: [
        ['order_id', 'DESC']
      ]
    });

    res.status(200).json({
      message: `تم تحديث ${updateResult[0]} طلب مشحون إلى مبرمج بنجاح للمتجر`,
      store_id: storeId,
      updated_count: updateResult[0],
      last_order_id: lastShippedOrder.order_id,
      updated_orders: updatedOrders,
      summary: {
        total_updated: updateResult[0],
        from_order_id: ordersToUpdate.length > 0 ? Math.min(...ordersToUpdate.map(o => o.order_id)) : null,
        to_order_id: lastShippedOrder.order_id
      }
    });

  } catch (error) {
    console.error('خطأ في تحديث طلبات المتجر إلى مبرمجة:', error);
    res.status(500).json({ 
      error: 'حدث خطأ في السيرفر أثناء تحديث الطلبات' 
    });
  }
};