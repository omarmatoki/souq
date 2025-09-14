const db = require('../models');
const { Op } = require('sequelize');

// استخراج النماذج من db للتأكد من الوضوح
const { Order, OrderItem, Product, Store, User, Shipping, Cart, CartItem, Review } = db;

// التحقق من وجود النماذج
console.log('Models check:', {
  Order: !!Order,
  OrderItem: !!OrderItem,
  Product: !!Product,
  Store: !!Store,
  Shipping: !!Shipping
});

// إنشاء الطلبات مباشرة بعد معلومات الشحن (بدون دفع حالياً)
exports.createOrder = async (req, res) => {
  const transaction = await db.sequelize.transaction();
 
  try {
    const { purchase_id } = req.body;
    
    // التحقق من وجود purchase_id
    if (!purchase_id) {
      await transaction.rollback();
      return res.status(400).json({ error: 'معرف عملية الشراء مطلوب' });
    }
    
    // العثور على معلومات الشحن باستخدام purchase_id
    const shipping = await Shipping.findOne({
      where: { purchase_id: purchase_id }
    });
    
    if (!shipping) {
      await transaction.rollback();
      return res.status(404).json({ error: 'معلومات الشحن غير موجودة لهذا المعرف' });
    }
    
    // العثور على السلة باستخدام customer_session_id
    const cart = await Cart.findOne({
      where: { session_id: shipping.customer_session_id },
      include: [{
        model: CartItem,
        include: [{ model: Product }]
      }]
    });
    
    if (!cart || !cart.CartItems || cart.CartItems.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ error: 'السلة فارغة أو غير موجودة' });
    }
    
    // التحقق من عدم وجود طلبات مسبقة لنفس purchase_id
    const existingOrders = await Order.findAll({
      where: { purchase_id: purchase_id }
    });
    
    if (existingOrders.length > 0) {
      await transaction.rollback();
      return res.status(409).json({ 
        error: 'توجد طلبات مسبقة لهذا المعرف',
        existing_orders_count: existingOrders.length
      });
    }
    
    // تجميع المنتجات حسب المتجر
    const itemsByStore = {};
    for (const cartItem of cart.CartItems) {
      const product = cartItem.Product;
      const store_id = product.store_id;
      
      if (!itemsByStore[store_id]) {
        itemsByStore[store_id] = [];
      }
      
      itemsByStore[store_id].push({
        cartItem: cartItem,
        product: product
      });
    }
    
    const createdOrders = [];
    
    // إنشاء طلب منفصل لكل متجر
    for (const [store_id, storeItems] of Object.entries(itemsByStore)) {
      // التحقق من وجود المتجر
      const store = await Store.findByPk(store_id);
      if (!store) {
        await transaction.rollback();
        return res.status(404).json({ error: `المتجر بالمعرف ${store_id} غير موجود` });
      }
      
      // حساب السعر الإجمالي لهذا المتجر
      let store_total_price = 0;
      const orderItems = [];
      
      for (const item of storeItems) {
        const product = item.product;
        const cartItem = item.cartItem;
        
        // التحقق من المخزون
        if (product.stock_quantity < cartItem.quantity) {
          await transaction.rollback();
          return res.status(400).json({ 
            error: `المخزون غير كافي للمنتج ${product.name} في المتجر ${store.store_name}` 
          });
        }
        
        // حساب السعر (مع مراعاة الخصم إن وجد)
        const finalPrice = product.getDiscountedPrice ? product.getDiscountedPrice() : product.price;
        const itemTotal = finalPrice * cartItem.quantity;
        store_total_price += itemTotal;
        
        orderItems.push({
          product_id: cartItem.product_id,
          quantity: cartItem.quantity,
          price_at_time: finalPrice
        });
      }
      
      // إنشاء الطلب للمتجر الحالي
      const order = await Order.create({
        store_id: parseInt(store_id),
        purchase_id: purchase_id,
        customer_session_id: shipping.customer_session_id,
        total_price: store_total_price,
        status: 'pending',
        settlement_status: 'not_settled' // إضافة حالة التصفير الافتراضية
      }, { transaction });
      
      // إضافة عناصر الطلب
      for (const item of orderItems) {
        await OrderItem.create({
          order_id: order.order_id,
          ...item
        }, { transaction });
        
        // نقص المخزون فوراً
        const product = await Product.findByPk(item.product_id);
        await product.update({
          stock_quantity: product.stock_quantity - item.quantity
        }, { transaction });
      }
      
      createdOrders.push(order.order_id);
    }
    
    // تنظيف السلة بعد إنشاء الطلبات
    await CartItem.destroy({
      where: { cart_id: cart.cart_id }
    }, { transaction });
    
    await transaction.commit();
    
    // إرجاع جميع الطلبات المُنشأة مع التفاصيل
    const ordersWithDetails = await Order.findAll({
      where: {
        order_id: createdOrders
      },
      include: [
        {
          model: OrderItem,
          include: [{ model: Product }]
        },
        { model: Store }
      ]
    });
    
    // العثور على معلومات الشحن مرة أخرى لإرجاعها
    const finalShipping = await Shipping.findOne({
      where: { purchase_id: purchase_id }
    });
    
    res.status(201).json({
      success: true,
      message: `تم إنشاء ${createdOrders.length} طلب بنجاح`,
      data: {
        purchase_id: purchase_id,
        orders: ordersWithDetails,
        shipping_info: finalShipping,
        customer_session_id: shipping.customer_session_id,
        total_orders: createdOrders.length,
        cart_cleared: true,
        note: 'الطلبات في حالة معلقة - سيتم تحديثها عند إضافة نظام الدفع'
      }
    });
    
  } catch (error) {
    await transaction.rollback();
    console.error('Order creation error:', error);
    res.status(500).json({ 
      success: false,
      error: 'حدث خطأ في إنشاء الطلب',
      message: process.env.NODE_ENV === 'development' ? error.message : 'خطأ داخلي في السيرفر'
    });
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

    const orders = await Order.findAll({
      where: whereClause,
      include: [
        {
          model: Store,
          attributes: ['store_name', 'logo_image']
        },
        {
          model: OrderItem,
          include: [{ model: Product }]
        }
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
    const order = await Order.findByPk(req.params.id, {
      include: [
        {
          model: Store,
          attributes: ['store_name', 'logo_image', 'store_address']
        },
        {
          model: OrderItem,
          include: [{ model: Product }]
        }
      ]
    });

    if (!order) {
      return res.status(404).json({ error: 'الطلب غير موجود' });
    }

    // جلب معلومات الشحن يدوياً
    let shippingInfo = null;
    if (order.purchase_id) {
      shippingInfo = await Shipping.findOne({
        where: { purchase_id: order.purchase_id }
      });
    }

    const orderData = order.toJSON();
    orderData.Shipping = shippingInfo;

    res.status(200).json(orderData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// تحديث حالة الطلب
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findByPk(req.params.id, {
      include: [{ model: Store }]
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
    const store = await Store.findByPk(store_id);
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

    const orders = await Order.findAll({
      where: whereClause,
      include: [
        {
          model: OrderItem,
          include: [{ model: Product }]
        }
      ],
      order: [['created_at', 'DESC']]
    });

    // إحضار معلومات الشحن باستخدام purchase_id الصحيح
    const ordersWithShipping = await Promise.all(
      orders.map(async (order) => {
        const shipping = await Shipping.findOne({
          where: { purchase_id: order.purchase_id }
        });
        return {
          ...order.toJSON(),
          Shipping: shipping
        };
      })
    );

    res.status(200).json(ordersWithShipping);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// حذف طلب
exports.deleteOrder = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    const order = await Order.findByPk(req.params.id, {
      include: [
        { model: Store },
        { model: OrderItem }
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
        const product = await Product.findByPk(item.product_id);
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
    const store = await Store.findByPk(store_id);
    if (!store) {
      await transaction.rollback();
      return res.status(404).json({ error: 'المتجر غير موجود' });
    }

    let total_price = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await Product.findByPk(item.product_id);
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
    const order = await Order.create({
      store_id,
      total_price,
      status: 'confirmed',
      settlement_status: 'not_settled' // إضافة حالة التصفير الافتراضية
    }, { transaction });

    // إضافة عناصر الطلب
    for (const item of orderItems) {
      await OrderItem.create({
        order_id: order.order_id,
        ...item
      }, { transaction });
    }

    await transaction.commit();

    // إرجاع الطلب مع التفاصيل
    const orderWithDetails = await Order.findByPk(order.order_id, {
      include: [
        {
          model: OrderItem,
          include: [{ model: Product }]
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

// جلب جميع الطلبات مع إحصائيات الحالة لمتجر معين
exports.getAllOrdersWithStats = async (req, res) => {
  try {
    const storeId = req.params.store_id;

    if (!storeId) {
      return res.status(400).json({ error: 'معرف المتجر مطلوب' });
    }

    // جلب جميع الطلبات للمتجر المحدد
    const allOrders = await Order.findAll({
      where: { store_id: storeId },
      include: [
        { model: Store, attributes: ['store_name', 'logo_image', 'store_address'] },
        { model: OrderItem, include: [{ model: Product }] }
      ],
      order: [['created_at', 'DESC']]
    });

    // تصنيف الطلبات
    const monitoredOrders = allOrders.filter(order => order.settlement_status === 'settled');
    const shippedOrders = allOrders.filter(order => order.status === 'shipped' && order.settlement_status !== 'settled');
    const unshippedOrders = allOrders.filter(order => order.status !== 'shipped' && order.settlement_status !== 'settled');

    // دالة لتنسيق الطلبات وإضافة معلومات الشحن
    const formatOrders = async (orders) => {
      const formattedOrders = await Promise.all(
        orders.map(async (order) => {
          const orderData = order.toJSON();

          // إضافة معلومات الشحن باستخدام purchase_id
          if (orderData.purchase_id) {
            try {
              const shippingInfo = await Shipping.findOne({ where: { purchase_id: orderData.purchase_id } });
              if (shippingInfo) {
                const shippingData = shippingInfo.toJSON();
                if (shippingData.identity_images) {
                  try {
                    const identityImages = JSON.parse(shippingData.identity_images);
                    shippingData.identity_images = identityImages.map(img => (typeof img === 'object' && img.path ? img.path : img));
                  } catch (error) {
                    console.error('خطأ في تحليل صور الهوية:', error);
                    shippingData.identity_images = [];
                  }
                }
                orderData.Shipping = shippingData;
              } else {
                orderData.Shipping = null;
              }
            } catch (error) {
              console.error('خطأ في جلب معلومات الشحن:', error);
              orderData.Shipping = null;
            }
          } else {
            orderData.Shipping = null;
          }

          // تنسيق صور المنتجات
          if (orderData.OrderItems) {
            orderData.OrderItems = orderData.OrderItems.map(item => {
              if (item.Product && item.Product.images) {
                try { item.Product.images = JSON.parse(item.Product.images); } 
                catch (error) { item.Product.images = []; }
              }
              return item;
            });
          }

          return orderData;
        })
      );

      return formattedOrders;
    };

    // تطبيق التنسيق
    const formattedAllOrders = await formatOrders(allOrders);
    const formattedShippedOrders = await formatOrders(shippedOrders);
    const formattedUnshippedOrders = await formatOrders(unshippedOrders);
    const formattedMonitoredOrders = await formatOrders(monitoredOrders);

    // حساب المبالغ
    const totalAllOrdersAmount = allOrders.reduce((sum, order) => sum + parseFloat(order.total_price || 0), 0);
    const totalShippedOrdersAmount = shippedOrders.reduce((sum, order) => sum + parseFloat(order.total_price || 0), 0);
    const totalUnshippedOrdersAmount = unshippedOrders.reduce((sum, order) => sum + parseFloat(order.total_price || 0), 0);
    const totalMonitoredOrdersAmount = monitoredOrders.reduce((sum, order) => sum + parseFloat(order.total_price || 0), 0);

    // الاستجابة النهائية
    const response = {
      storeId: parseInt(storeId),
      storeName: allOrders[0]?.Store?.store_name || 'غير محدد',
      allOrders: { orders: formattedAllOrders, count: allOrders.length, totalAmount: parseFloat(totalAllOrdersAmount.toFixed(2)) },
      shippedOrders: { orders: formattedShippedOrders, count: shippedOrders.length, totalAmount: parseFloat(totalShippedOrdersAmount.toFixed(2)) },
      unshippedOrders: { orders: formattedUnshippedOrders, count: unshippedOrders.length, totalAmount: parseFloat(totalUnshippedOrdersAmount.toFixed(2)) },
      monitoredOrders: { orders: formattedMonitoredOrders, count: monitoredOrders.length, totalAmount: parseFloat(totalMonitoredOrdersAmount.toFixed(2)) },
      statistics: {
        totalOrders: allOrders.length,
        shippedCount: shippedOrders.length,
        unshippedCount: unshippedOrders.length,
        monitoredCount: monitoredOrders.length,
        shippedPercentage: allOrders.length > 0 ? parseFloat(((shippedOrders.length / allOrders.length) * 100).toFixed(2)) : 0,
        unshippedPercentage: allOrders.length > 0 ? parseFloat(((unshippedOrders.length / allOrders.length) * 100).toFixed(2)) : 0,
        monitoredPercentage: allOrders.length > 0 ? parseFloat(((monitoredOrders.length / allOrders.length) * 100).toFixed(2)) : 0,
        totalRevenue: parseFloat(totalAllOrdersAmount.toFixed(2)),
        shippedRevenue: parseFloat(totalShippedOrdersAmount.toFixed(2)),
        unshippedRevenue: parseFloat(totalUnshippedOrdersAmount.toFixed(2)),
        monitoredRevenue: 0, // دائمًا صفر كما طلبت
        averageOrderValue: allOrders.length > 0 ? parseFloat((totalAllOrdersAmount / allOrders.length).toFixed(2)) : 0,
        revenuePercentageShipped: totalAllOrdersAmount > 0 ? parseFloat(((totalShippedOrdersAmount / totalAllOrdersAmount) * 100).toFixed(2)) : 0,
        revenuePercentageUnshipped: totalAllOrdersAmount > 0 ? parseFloat(((totalUnshippedOrdersAmount / totalAllOrdersAmount) * 100).toFixed(2)) : 0,
        revenuePercentageMonitored: totalAllOrdersAmount > 0 ? parseFloat(((totalMonitoredOrdersAmount / totalAllOrdersAmount) * 100).toFixed(2)) : 0
      }
    };

    res.status(200).json(response);

  } catch (error) {
    console.error('خطأ في جلب طلبات المتجر:', error);
    res.status(500).json({ 
      error: 'حدث خطأ في السيرفر أثناء جلب طلبات المتجر',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};



// تغيير حالة الطلب من غير مشحونة إلى مشحونة
exports.updateOrderToShipped = async (req, res) => {
  try {
    const { id } = req.params;
    const order_id = id;

    console.log('Order ID from params:', id);

    if (!id) {
      return res.status(400).json({ error: 'معرف الطلب مطلوب' });
    }

    // جلب الطلب
    const order = await Order.findByPk(order_id, {
      include: [
        {
          model: Store,
          attributes: ['store_name', 'logo_image', 'store_address']
        },
        {
          model: OrderItem,
          include: [{ model: Product }]
        }
      ]
    });

    if (!order) {
      return res.status(404).json({ error: 'الطلب غير موجود' });
    }

    // تحديث حالة الطلب إلى "shipped"
    await order.update({ status: 'shipped' });

    // جلب معلومات الشحن يدوياً باستخدام purchase_id
    let shippingInfo = null;
    if (order.purchase_id) {
      try {
        shippingInfo = await Shipping.findOne({
          where: { purchase_id: order.purchase_id }
        });
      } catch (error) {
        console.error('خطأ في جلب معلومات الشحن:', error);
      }
    }

    // تنسيق البيانات
    const orderData = order.toJSON();
    
    // إضافة معلومات الشحن
    if (shippingInfo) {
      const shippingData = shippingInfo.toJSON();
      
      // تنسيق صور الهوية
      if (shippingData.identity_images) {
        try {
          const identityImages = JSON.parse(shippingData.identity_images);
          shippingData.identity_images = identityImages.map(img => {
            if (typeof img === 'object' && img.path) {
              return img.path;
            }
            return img;
          });
        } catch (error) {
          console.error('خطأ في تحليل صور الهوية:', error);
          shippingData.identity_images = [];
        }
      }
      
      orderData.Shipping = shippingData;
    } else {
      orderData.Shipping = null;
    }

    // تنسيق صور المنتجات
    if (orderData.OrderItems) {
      orderData.OrderItems = orderData.OrderItems.map(item => {
        if (item.Product && item.Product.images) {
          try {
            item.Product.images = JSON.parse(item.Product.images);
          } catch (error) {
            console.error('خطأ في تحليل صور المنتج:', error);
            item.Product.images = [];
          }
        }
        return item;
      });
    }

    res.status(200).json({
      message: 'تم تحديث حالة الطلب إلى مشحون بنجاح',
      order: orderData
    });

  } catch (error) {
    console.error('خطأ في تحديث حالة الطلب:', error);
    res.status(500).json({ 
      error: 'حدث خطأ في السيرفر أثناء تحديث حالة الطلب',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// تحديث طلبات المتجر المشحونة إلى مبرمجة
exports.updateStoreShippedOrdersToProgrammatic = async (req, res) => {
  try {
    const storeId = req.params.store_id;

    if (!storeId) {
      return res.status(400).json({ 
        error: 'معرف المتجر مطلوب' 
      });
    }

    // البحث عن آخر طلب مشحون غير مبرمج للمتجر المحدد
    const lastShippedOrder = await Order.findOne({
      where: {
        store_id: storeId,
        status: 'shipped',
        settlement_status: 'not_settled' // استخدام settlement_status بدلاً من is_programmatic
      },
      order: [
        ['order_id', 'DESC']
      ]
    });

    if (!lastShippedOrder) {
      return res.status(404).json({ 
        error: 'لا توجد طلبات مشحونة غير مصفرة لهذا المتجر' 
      });
    }

    // جلب جميع الطلبات المشحونة غير المصفرة من آخر طلب وما قبله
    const ordersToUpdate = await Order.findAll({
      where: {
        store_id: storeId,
        status: 'shipped',
        settlement_status: 'not_settled',
        order_id: {
          [Op.lte]: lastShippedOrder.order_id
        }
      },
      order: [
        ['order_id', 'DESC']
      ]
    });

    // تحديث جميع هذه الطلبات إلى settlement_requested
    const updateResult = await Order.update(
      { settlement_status: 'settlement_requested', settlement_requested_at: new Date() },
      { 
        where: {
          store_id: storeId,
          status: 'shipped',
          settlement_status: 'not_settled',
          order_id: {
            [Op.lte]: lastShippedOrder.order_id
          }
        }
      }
    );

    // جلب الطلبات المحدثة مع بياناتها الكاملة
    const updatedOrders = await Order.findAll({
      where: {
        store_id: storeId,
        status: 'shipped',
        settlement_status: 'settlement_requested',
        order_id: {
          [Op.lte]: lastShippedOrder.order_id
        }
      },
      include: [
        {
          model: Store,
          attributes: ['store_name', 'logo_image', 'store_address']
        },
        {
          model: OrderItem,
          include: [{ model: Product }]
        }
      ],
      order: [
        ['order_id', 'DESC']
      ]
    });

    res.status(200).json({
      message: `تم طلب تصفير ${updateResult[0]} طلب مشحون للمتجر`,
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
    console.error('خطأ في تحديث طلبات المتجر:', error);
    res.status(500).json({ 
      error: 'حدث خطأ في السيرفر أثناء تحديث الطلبات' 
    });
  }
};

// فلترة طلبات المتجر
exports.filterStoreOrders = async (req, res) => {
  try {
    const { store_id } = req.params;
    const { 
      customerName,
      productName,
      orderStatus,
      shippingStatus,
      dateFrom,
      dateTo,
      page = 1,
      limit = 20
    } = req.query;

    // جلب بيانات المتجر مع صاحب المتجر
    const store = await Store.findByPk(store_id, {
      include: [
        {
          model: User,
          attributes: ['username', 'whatsapp_number']
        }
      ]
    });

    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'المتجر غير موجود'
      });
    }

    // بناء شروط البحث الأساسية للطلبات
    let whereConditions = { store_id };

    // فلترة حسب حالة الطلب
    if (orderStatus && orderStatus.trim()) {
      whereConditions.status = orderStatus.trim();
    }

    // فلترة حسب التاريخ
    if (dateFrom || dateTo) {
      whereConditions.created_at = {};
      if (dateFrom) {
        whereConditions.created_at[Op.gte] = new Date(dateFrom);
      }
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        whereConditions.created_at[Op.lte] = endDate;
      }
    }

    // إذا كان هناك بحث بالزبون أو المنتج، نحتاج لاستعلامات فرعية
    if (customerName && customerName.trim()) {
      // البحث في جدول الشحن عن اسم الزبون
      const shippingOrderIds = await Shipping.findAll({
        where: {
          [Op.or]: [
            {
              customer_name: {
                [Op.like]: `%${customerName.trim()}%`
              }
            },
            {
              recipient_name: {
                [Op.like]: `%${customerName.trim()}%`
              }
            }
          ]
        },
        attributes: ['purchase_id']
      });

      const purchaseIds = shippingOrderIds.map(s => s.purchase_id);
      if (purchaseIds.length === 0) {
        return res.status(200).json({
          ...store.toJSON(),
          Products: [],
          statistics: await getEmptyStatistics(store_id),
          pagination: {
            currentPage: 1,
            totalPages: 0,
            totalOrders: 0,
            ordersPerPage: parseInt(limit),
            hasNextPage: false,
            hasPrevPage: false
          },
          filters: { customerName, productName, orderStatus, shippingStatus, dateFrom, dateTo }
        });
      }

      whereConditions.purchase_id = {
        [Op.in]: purchaseIds
      };
    }

    if (productName && productName.trim()) {
      // البحث في المنتجات ثم في OrderItems
      const products = await Product.findAll({
        where: {
          name: {
            [Op.like]: `%${productName.trim()}%`
          }
        },
        attributes: ['product_id']
      });

      const productIds = products.map(p => p.product_id);
      if (productIds.length === 0) {
        return res.status(200).json({
          ...store.toJSON(),
          Products: [],
          statistics: await getEmptyStatistics(store_id),
          pagination: {
            currentPage: 1,
            totalPages: 0,
            totalOrders: 0,
            ordersPerPage: parseInt(limit),
            hasNextPage: false,
            hasPrevPage: false
          },
          filters: { customerName, productName, orderStatus, shippingStatus, dateFrom, dateTo }
        });
      }

      const orderItems = await OrderItem.findAll({
        where: {
          product_id: {
            [Op.in]: productIds
          }
        },
        attributes: ['order_id']
      });

      const orderIds = orderItems.map(oi => oi.order_id);
      if (orderIds.length === 0) {
        return res.status(200).json({
          ...store.toJSON(),
          Products: [],
          statistics: await getEmptyStatistics(store_id),
          pagination: {
            currentPage: 1,
            totalPages: 0,
            totalOrders: 0,
            ordersPerPage: parseInt(limit),
            hasNextPage: false,
            hasPrevPage: false
          },
          filters: { customerName, productName, orderStatus, shippingStatus, dateFrom, dateTo }
        });
      }

      // دمج شروط order_id إذا كانت موجودة من قبل
      if (whereConditions.order_id) {
        whereConditions.order_id = {
          [Op.and]: [
            whereConditions.order_id,
            { [Op.in]: orderIds }
          ]
        };
      } else {
        whereConditions.order_id = {
          [Op.in]: orderIds
        };
      }
    }

    // حساب offset للتصفح
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // جلب الطلبات الأساسية
    const { count, rows: orders } = await Order.findAndCountAll({
      where: whereConditions,
      limit: parseInt(limit),
      offset: offset,
      order: [['created_at', 'DESC']]
    });

    // جلب بيانات الشحن للطلبات
    const orderIds = orders.map(order => order.order_id);
    const shippingData = {};
    if (orderIds.length > 0) {
      const shippings = await Shipping.findAll({
        where: {
          purchase_id: {
            [Op.in]: orders.map(o => o.purchase_id).filter(p => p)
          }
        }
      });

      // فلترة إضافية حسب حالة الشحن إذا كانت مطلوبة
      const filteredShippings = shippingStatus 
        ? shippings.filter(s => s.shipping_status === shippingStatus.trim())
        : shippings;

      filteredShippings.forEach(shipping => {
        // البحث عن الطلب المناسب باستخدام purchase_id
        const matchingOrder = orders.find(o => o.purchase_id === shipping.purchase_id);
        if (matchingOrder) {
          shippingData[matchingOrder.order_id] = shipping;
        }
      });

      // إذا كان هناك فلترة بحالة الشحن وكانت النتائج فارغة
      if (shippingStatus && filteredShippings.length === 0) {
        return res.status(200).json({
          ...store.toJSON(),
          Products: [],
          statistics: await getEmptyStatistics(store_id),
          pagination: {
            currentPage: 1,
            totalPages: 0,
            totalOrders: 0,
            ordersPerPage: parseInt(limit),
            hasNextPage: false,
            hasPrevPage: false
          },
          filters: { customerName, productName, orderStatus, shippingStatus, dateFrom, dateTo }
        });
      }
    }

    // جلب بيانات OrderItems والمنتجات
    const orderItemsData = {};
    if (orderIds.length > 0) {
      const orderItems = await OrderItem.findAll({
        where: {
          order_id: {
            [Op.in]: orderIds
          }
        },
        include: [
          {
            model: Product,
            attributes: ['product_id', 'name', 'price', 'images']
          }
        ]
      });

      orderItems.forEach(item => {
        if (!orderItemsData[item.order_id]) {
          orderItemsData[item.order_id] = [];
        }
        orderItemsData[item.order_id].push(item);
      });
    }

    // تنسيق الطلبات كمنتجات
    const formattedOrders = [];
    
    orders.forEach(order => {
      const orderData = order.toJSON();
      const shipping = shippingData[order.order_id];
      const items = orderItemsData[order.order_id] || [];

      items.forEach(item => {
        const product = item.Product;
        
        formattedOrders.push({
          product_id: product.product_id,
          store_id: parseInt(store_id),
          name: product.name,
          description: `طلب رقم: ${orderData.order_id} - زبون: ${shipping?.customer_name || 'غير محدد'}`,
          price: item.price_at_time || product.price,
          stock_quantity: item.quantity,
          images: product.images,
          created_at: orderData.created_at,
          averageRating: 0,
          reviewsCount: 0,
          stockStatus: 'متوفر',
          // معلومات إضافية خاصة بالطلب
          order_id: orderData.order_id,
          order_status: orderData.status,
          settlement_status: orderData.settlement_status,
          customer_name: shipping?.customer_name,
          shipping_status: shipping?.shipping_status,
          total_price: orderData.total_price,
          quantity_ordered: item.quantity
        });
      });
    });

    // جلب التقييمات للمنتجات
    const productIds = [...new Set(formattedOrders.map(item => item.product_id))];
    const productReviews = {};
    
    if (productIds.length > 0) {
      const reviews = await Review.findAll({
        where: {
          product_id: {
            [Op.in]: productIds
          }
        },
        attributes: ['product_id', 'rating']
      });

      reviews.forEach(review => {
        if (!productReviews[review.product_id]) {
          productReviews[review.product_id] = [];
        }
        productReviews[review.product_id].push(review.rating);
      });

      // تحديث التقييمات في البيانات المنسقة
      formattedOrders.forEach(item => {
        if (productReviews[item.product_id]) {
          const ratings = productReviews[item.product_id];
          const totalRating = ratings.reduce((sum, rating) => sum + rating, 0);
          item.averageRating = parseFloat((totalRating / ratings.length).toFixed(1));
          item.reviewsCount = ratings.length;
        }
      });
    }

    // حساب الإحصائيات
    const statistics = await calculateStatistics(store_id);

    // تنسيق البيانات النهائية
    const storeData = store.toJSON();
    
    const response = {
      store_id: storeData.store_id,
      user_id: storeData.user_id,
      store_name: storeData.store_name,
      store_address: storeData.store_address,
      description: storeData.description,
      images: storeData.images,
      logo_image: storeData.logo_image,
      created_at: storeData.created_at,
      User: {
        username: storeData.User.username,
        whatsapp_number: storeData.User.whatsapp_number
      },
      Products: formattedOrders,
      statistics: statistics,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / parseInt(limit)),
        totalOrders: count,
        ordersPerPage: parseInt(limit),
        hasNextPage: parseInt(page) < Math.ceil(count / parseInt(limit)),
        hasPrevPage: parseInt(page) > 1
      },
      filters: {
        customerName: customerName || null,
        productName: productName || null,
        orderStatus: orderStatus || null,
        shippingStatus: shippingStatus || null,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        appliedFilters: {
          customerSearch: !!customerName,
          productSearch: !!productName,
          statusFilter: !!orderStatus,
          shippingFilter: !!shippingStatus,
          dateFilter: !!(dateFrom || dateTo)
        }
      }
    };

    res.status(200).json(response);

  } catch (error) {
    console.error('Error in filterStoreOrders:', error);
    res.status(500).json({ 
      success: false,
      error: 'حدث خطأ في السيرفر',
      message: error.message 
    });
  }
};

// دالة مساعدة لحساب الإحصائيات
async function calculateStatistics(store_id) {
  try {
    // إحصائيات الطلبات
    const orderStats = await Order.findAll({
      where: { store_id },
      attributes: [
        [db.sequelize.fn('COUNT', db.sequelize.col('order_id')), 'totalOrders'],
        [db.sequelize.fn('SUM', db.sequelize.col('total_price')), 'totalRevenue'],
        [db.sequelize.fn('AVG', db.sequelize.col('total_price')), 'averageOrderValue']
      ],
      raw: true
    });

    // إحصائيات الطلبات حسب الحالة
    const ordersByStatus = await Order.findAll({
      where: { store_id },
      attributes: [
        'status',
        [db.sequelize.fn('COUNT', db.sequelize.col('order_id')), 'count']
      ],
      group: ['status'],
      raw: true
    });

    // إحصائيات المنتجات
    const productStats = await Product.findAll({
      where: { store_id },
      attributes: [
        [db.sequelize.fn('COUNT', db.sequelize.col('product_id')), 'total'],
        [db.sequelize.fn('SUM', 
          db.sequelize.literal('CASE WHEN stock_quantity > 5 THEN 1 ELSE 0 END')
        ), 'available'],
        [db.sequelize.fn('SUM', 
          db.sequelize.literal('CASE WHEN stock_quantity BETWEEN 1 AND 5 THEN 1 ELSE 0 END')
        ), 'low_stock'],
        [db.sequelize.fn('SUM', 
          db.sequelize.literal('CASE WHEN stock_quantity = 0 THEN 1 ELSE 0 END')
        ), 'out_of_stock']
      ],
      raw: true
    });

    // إحصائيات التقييمات
    const reviewStats = await Review.findAll({
      include: [
        {
          model: Product,
          where: { store_id },
          attributes: []
        }
      ],
      attributes: [
        [db.sequelize.fn('AVG', db.sequelize.col('rating')), 'averageRating'],
        [db.sequelize.fn('COUNT', db.sequelize.col('Review.review_id')), 'totalReviews']
      ],
      raw: true
    });

    const orders = orderStats[0];
    const products = productStats[0];
    const reviews = reviewStats[0];

    const orderStatusCounts = {};
    ordersByStatus.forEach(item => {
      orderStatusCounts[item.status] = parseInt(item.count);
    });

    return {
      totalProducts: parseInt(products.total) || 0,
      availableProducts: parseInt(products.available) || 0,
      outOfStockProducts: parseInt(products.out_of_stock) || 0,
      lowStockProducts: parseInt(products.low_stock) || 0,
      averageRating: reviews.averageRating ? parseFloat(parseFloat(reviews.averageRating).toFixed(1)) : 0,
      totalReviews: parseInt(reviews.totalReviews) || 0,
      totalOrders: parseInt(orders.totalOrders) || 0,
      totalRevenue: parseFloat(orders.totalRevenue || 0).toFixed(2),
      ordersByStatus: orderStatusCounts,
      averageOrderValue: parseFloat(orders.averageOrderValue || 0).toFixed(2)
    };
  } catch (error) {
    console.error('Error calculating statistics:', error);
    return getEmptyStatistics();
  }
}

// دالة مساعدة للإحصائيات الفارغة
function getEmptyStatistics() {
  return {
    totalProducts: 0,
    availableProducts: 0,
    outOfStockProducts: 0,
    lowStockProducts: 0,
    averageRating: 0,
    totalReviews: 0,
    totalOrders: 0,
    totalRevenue: "0.00",
    ordersByStatus: {},
    averageOrderValue: "0.00"
  };
}

// إحصائيات الطلبات العامة
exports.getOrdersStatistics = async (req, res) => {
  try {
    const { store_id } = req.params;
    const statistics = await calculateStatistics(store_id);

    res.status(200).json({
      success: true,
      data: statistics
    });

  } catch (error) {
    console.error('Error in getOrdersStatistics:', error);
    res.status(500).json({ 
      success: false,
      error: 'حدث خطأ في السيرفر' 
    });
  }
};

// ========== دوال التصفير الجديدة ==========

// دالة مساعدة لحساب إحصائيات التصفير
const calculateSettlementStatistics = async (store_id) => {
  try {
    if (!Order) {
      throw new Error('Order model is not defined');
    }

    console.log('Calculating settlement statistics for store:', store_id);
    
    // الحصول على إحصائيات مفصلة حسب حالة التصفير
    const stats = await Order.findAll({
      attributes: [
        'settlement_status',
        [Order.sequelize.fn('COUNT', Order.sequelize.col('order_id')), 'count'],
        [Order.sequelize.fn('SUM', Order.sequelize.col('total_price')), 'total_amount'],
        [Order.sequelize.fn('AVG', Order.sequelize.col('total_price')), 'average_amount']
      ],
      where: {
        store_id: store_id
      },
      group: ['settlement_status'],
      raw: true
    });

    console.log('Raw settlement stats from DB:', stats);

    // تنسيق النتائج
    const formattedStats = {
      not_settled: { 
        count: 0, 
        total_amount: '0.00', 
        average_amount: '0.00',
        label: 'غير مصفر'
      },
      settlement_requested: { 
        count: 0, 
        total_amount: '0.00', 
        average_amount: '0.00',
        label: 'تم الطلب'
      },
      settled: { 
        count: 0, 
        total_amount: '0.00', 
        average_amount: '0.00',
        label: 'تم التصفير'
      }
    };

    // ملء البيانات من قاعدة البيانات
    stats.forEach(stat => {
      if (formattedStats[stat.settlement_status]) {
        formattedStats[stat.settlement_status] = {
          count: parseInt(stat.count) || 0,
          total_amount: parseFloat(stat.total_amount || 0).toFixed(2),
          average_amount: parseFloat(stat.average_amount || 0).toFixed(2),
          label: formattedStats[stat.settlement_status].label
        };
      }
    });

    // حساب الإجماليات
    const totalOrders = Object.values(formattedStats).reduce((sum, stat) => sum + stat.count, 0);
    const totalAmount = Object.values(formattedStats).reduce((sum, stat) => sum + parseFloat(stat.total_amount), 0);

    // إحصائيات إضافية مفيدة
    const additionalStats = {
      total_orders: totalOrders,
      total_amount: totalAmount.toFixed(2),
      settlement_rate: totalOrders > 0 ? ((formattedStats.settled.count / totalOrders) * 100).toFixed(2) + '%' : '0%',
      pending_settlement_amount: formattedStats.settlement_requested.total_amount,
      available_for_settlement_amount: formattedStats.not_settled.total_amount
    };

    return {
      settlement_breakdown: formattedStats,
      summary: additionalStats
    };

  } catch (error) {
    console.error('Error calculating settlement statistics:', error);
    throw error;
  }
};

// التابع الرئيسي للحصول على إحصائيات التصفير
exports.getSettlementStatistics = async (req, res) => {
  try {
    const { store_id } = req.params;
    
    console.log('getSettlementStatistics called for store_id:', store_id);
    
    const statistics = await calculateSettlementStatistics(store_id);

    res.status(200).json({
      success: true,
      data: statistics
    });

  } catch (error) {
    console.error('Error in getSettlementStatistics:', error);
    res.status(500).json({ 
      success: false,
      error: 'حدث خطأ في السيرفر',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// تابع مُصحح للحصول على جميع المتاجر التي طلبت التصفير
exports.getPendingSettlementOrders = async (req, res) => {
  try {
    // الحصول على جميع الطلبات التي في حالة "تم الطلب" (settlement_requested)
    const pendingOrders = await Order.findAll({
      where: {
        settlement_status: 'settlement_requested'
      },
      attributes: [
        'order_id',
        'store_id',
        'purchase_id',
        'total_price',
        'status',
        'settlement_status',
        'settlement_requested_at',
        'created_at'
      ],
      include: [
        {
          model: Store,
          attributes: ['store_id', 'store_name', 'store_address', 'user_id'],
          include: [
            {
              model: User,
              // ✅ إزالة email من attributes لأنه غير موجود في الجدول
              attributes: ['user_id', 'username', 'whatsapp_number']
            }
          ]
        }
      ],
      order: [['settlement_requested_at', 'DESC']]
    });

    if (pendingOrders.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'لا توجد طلبات معلقة للتصفير حالياً',
        data: {
          stores: [],
          summary: {
            total_stores: 0,
            total_orders: 0,
            total_amount: '0.00'
          }
        }
      });
    }

    // تجميع الطلبات حسب المتجر
    const storeGroups = {};
    
    pendingOrders.forEach(order => {
      const store = order.Store;
      const storeId = store.store_id;
      
      if (!storeGroups[storeId]) {
        storeGroups[storeId] = {
          store_info: {
            store_id: store.store_id,
            store_name: store.store_name,
            store_address: store.store_address,
            owner: {
              user_id: store.User.user_id,
              username: store.User.username,
              // ✅ إزالة email من البيانات المُعادة
              whatsapp_number: store.User.whatsapp_number
            }
          },
          orders: [],
          summary: {
            orders_count: 0,
            total_amount: 0,
            oldest_request_date: null,
            newest_request_date: null
          }
        };
      }
      
      // إضافة الطلب للمتجر
      const orderData = {
        order_id: order.order_id,
        purchase_id: order.purchase_id,
        total_price: parseFloat(order.total_price),
        status: order.status,
        settlement_requested_at: order.settlement_requested_at,
        created_at: order.created_at,
        days_since_request: Math.floor((new Date() - new Date(order.settlement_requested_at)) / (1000 * 60 * 60 * 24))
      };
      
      storeGroups[storeId].orders.push(orderData);
      storeGroups[storeId].summary.orders_count++;
      storeGroups[storeId].summary.total_amount += parseFloat(order.total_price);
      
      // تحديث تواريخ أقدم وأحدث طلب
      const requestDate = new Date(order.settlement_requested_at);
      if (!storeGroups[storeId].summary.oldest_request_date || requestDate < new Date(storeGroups[storeId].summary.oldest_request_date)) {
        storeGroups[storeId].summary.oldest_request_date = order.settlement_requested_at;
      }
      if (!storeGroups[storeId].summary.newest_request_date || requestDate > new Date(storeGroups[storeId].summary.newest_request_date)) {
        storeGroups[storeId].summary.newest_request_date = order.settlement_requested_at;
      }
    });

    // تحويل إلى مصفوفة وترتيب حسب إجمالي المبلغ (من الأكبر للأصغر)
    const storesArray = Object.values(storeGroups).map(storeGroup => ({
      ...storeGroup,
      summary: {
        ...storeGroup.summary,
        total_amount: storeGroup.summary.total_amount.toFixed(2),
        average_order_value: (storeGroup.summary.total_amount / storeGroup.summary.orders_count).toFixed(2)
      }
    })).sort((a, b) => parseFloat(b.summary.total_amount) - parseFloat(a.summary.total_amount));

    // حساب الإحصائيات الإجمالية
    const totalSummary = {
      total_stores: storesArray.length,
      total_orders: pendingOrders.length,
      total_amount: pendingOrders.reduce((sum, order) => sum + parseFloat(order.total_price), 0).toFixed(2),
      average_amount_per_store: storesArray.length > 0 ? 
        (pendingOrders.reduce((sum, order) => sum + parseFloat(order.total_price), 0) / storesArray.length).toFixed(2) : '0.00',
      average_orders_per_store: storesArray.length > 0 ? 
        Math.round(pendingOrders.length / storesArray.length) : 0
    };

    // إضافة ترتيب للمتاجر
    const storesWithRanking = storesArray.map((store, index) => ({
      ...store,
      rank: index + 1,
      percentage_of_total: totalSummary.total_amount > 0 ? 
        ((parseFloat(store.summary.total_amount) / parseFloat(totalSummary.total_amount)) * 100).toFixed(2) + '%' : '0%'
    }));

    res.status(200).json({
      success: true,
      message: `تم العثور على ${storesArray.length} متجر لديه طلبات معلقة للتصفير`,
      data: {
        stores: storesWithRanking,
        summary: totalSummary,
        metadata: {
          generated_at: new Date().toISOString(),
          currency: 'ر.س',
          settlement_status: 'settlement_requested'
        }
      }
    });

  } catch (error) {
    console.error('Error in getPendingSettlementOrders:', error);
    res.status(500).json({ 
      success: false,
      error: 'حدث خطأ في السيرفر أثناء جلب الطلبات المعلقة للتصفير',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// تابع مُصحح للحصول على تفاصيل متجر واحد فقط
exports.getStorePendingSettlement = async (req, res) => {
  try {
    const { store_id } = req.params;
    
    // للتأكد من وجود المتجر
    const store = await Store.findByPk(store_id, {
      include: [
        {
          model: User,
          // ✅ إزالة email من attributes
          attributes: ['user_id', 'username', 'whatsapp_number']
        }
      ]
    });

    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'المتجر غير موجود'
      });
    }

    // الحصول على طلبات هذا المتجر المعلقة للتصفير
    const pendingOrders = await Order.findAll({
      where: {
        store_id: store_id,
        settlement_status: 'settlement_requested'
      },
      attributes: [
        'order_id',
        'purchase_id',
        'total_price',
        'status',
        'settlement_requested_at',
        'created_at'
      ],
      order: [['settlement_requested_at', 'DESC']]
    });

    if (pendingOrders.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'لا توجد طلبات معلقة للتصفير لهذا المتجر',
        data: {
          store_info: {
            store_id: store.store_id,
            store_name: store.store_name,
            store_address: store.store_address,
            owner: {
              user_id: store.User.user_id,
              username: store.User.username,
              // ✅ إزالة email
              whatsapp_number: store.User.whatsapp_number
            }
          },
          orders: [],
          summary: {
            orders_count: 0,
            total_amount: '0.00'
          }
        }
      });
    }

    // تنسيق الطلبات
    const formattedOrders = pendingOrders.map(order => ({
      order_id: order.order_id,
      purchase_id: order.purchase_id,
      total_price: parseFloat(order.total_price),
      status: order.status,
      settlement_requested_at: order.settlement_requested_at,
      created_at: order.created_at,
      days_since_request: Math.floor((new Date() - new Date(order.settlement_requested_at)) / (1000 * 60 * 60 * 24))
    }));

    // حساب الإحصائيات
    const totalAmount = pendingOrders.reduce((sum, order) => sum + parseFloat(order.total_price), 0);

    const response = {
      store_info: {
        store_id: store.store_id,
        store_name: store.store_name,
        store_address: store.store_address,
        owner: {
          user_id: store.User.user_id,
          username: store.User.username,
          // ✅ إزالة email
          whatsapp_number: store.User.whatsapp_number
        }
      },
      orders: formattedOrders,
      summary: {
        orders_count: pendingOrders.length,
        total_amount: totalAmount.toFixed(2),
        average_order_value: (totalAmount / pendingOrders.length).toFixed(2),
        oldest_request_date: pendingOrders[pendingOrders.length - 1]?.settlement_requested_at,
        newest_request_date: pendingOrders[0]?.settlement_requested_at
      }
    };

    res.status(200).json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error('Error in getStorePendingSettlement:', error);
    res.status(500).json({ 
      success: false,
      error: 'حدث خطأ في السيرفر أثناء جلب طلبات التصفير للمتجر' 
    });
  }
};

// تابع إضافي للحصول على تفاصيل متجر واحد فقط (إذا كان مطلوباً)
exports.getStorePendingSettlement = async (req, res) => {
  try {
    const { store_id } = req.params;
    
    // للتأكد من وجود المتجر
    const store = await Store.findByPk(store_id, {
      include: [
        {
          model: User,
          attributes: ['user_id', 'username', 'email', 'whatsapp_number']
        }
      ]
    });

    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'المتجر غير موجود'
      });
    }

    // الحصول على طلبات هذا المتجر المعلقة للتصفير
    const pendingOrders = await Order.findAll({
      where: {
        store_id: store_id,
        settlement_status: 'settlement_requested'
      },
      attributes: [
        'order_id',
        'purchase_id',
        'total_price',
        'status',
        'settlement_requested_at',
        'created_at'
      ],
      order: [['settlement_requested_at', 'DESC']]
    });

    if (pendingOrders.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'لا توجد طلبات معلقة للتصفير لهذا المتجر',
        data: {
          store_info: {
            store_id: store.store_id,
            store_name: store.store_name,
            store_address: store.store_address,
            owner: {
              user_id: store.User.user_id,
              username: store.User.username,
              email: store.User.email,
              whatsapp_number: store.User.whatsapp_number
            }
          },
          orders: [],
          summary: {
            orders_count: 0,
            total_amount: '0.00'
          }
        }
      });
    }

    // تنسيق الطلبات
    const formattedOrders = pendingOrders.map(order => ({
      order_id: order.order_id,
      purchase_id: order.purchase_id,
      total_price: parseFloat(order.total_price),
      status: order.status,
      settlement_requested_at: order.settlement_requested_at,
      created_at: order.created_at,
      days_since_request: Math.floor((new Date() - new Date(order.settlement_requested_at)) / (1000 * 60 * 60 * 24))
    }));

    // حساب الإحصائيات
    const totalAmount = pendingOrders.reduce((sum, order) => sum + parseFloat(order.total_price), 0);

    const response = {
      store_info: {
        store_id: store.store_id,
        store_name: store.store_name,
        store_address: store.store_address,
        owner: {
          user_id: store.User.user_id,
          username: store.User.username,
          email: store.User.email,
          whatsapp_number: store.User.whatsapp_number
        }
      },
      orders: formattedOrders,
      summary: {
        orders_count: pendingOrders.length,
        total_amount: totalAmount.toFixed(2),
        average_order_value: (totalAmount / pendingOrders.length).toFixed(2),
        oldest_request_date: pendingOrders[pendingOrders.length - 1]?.settlement_requested_at,
        newest_request_date: pendingOrders[0]?.settlement_requested_at
      }
    };

    res.status(200).json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error('Error in getStorePendingSettlement:', error);
    res.status(500).json({ 
      success: false,
      error: 'حدث خطأ في السيرفر أثناء جلب طلبات التصفير للمتجر' 
    });
  }
};

// دالة مساعدة لطلب تصفير الطلبات
const requestOrdersSettlement = async (store_id) => {
  try {
    if (!Order) {
      throw new Error('Order model is not defined');
    }

    console.log('Requesting settlement for store:', store_id);

    // البحث عن جميع الطلبات غير المصفرة
    const ordersToUpdate = await Order.findAll({
      where: {
        store_id: store_id,
        settlement_status: 'not_settled'
      }
    });

    console.log('Found orders to update:', ordersToUpdate.length);

    if (ordersToUpdate.length === 0) {
      return {
        success: false,
        message: 'لم يتم موافقة الادمن على تصفير الطلبات السابقة',
        ordersCount: 0
      };
    }

    // حساب إجمالي المبلغ
    const totalAmount = ordersToUpdate.reduce((sum, order) => {
      return sum + parseFloat(order.total_price || 0);
    }, 0);

    // تحديث جميع الطلبات إلى حالة "تم الطلب"
    const [updatedCount] = await Order.update(
      {
        settlement_status: 'settlement_requested',
        settlement_requested_at: new Date()
      },
      {
        where: {
          store_id: store_id,
          settlement_status: 'not_settled'
        }
      }
    );

    console.log('Updated orders count:', updatedCount);

    return {
      success: true,
      message: `تم طلب تصفير ${updatedCount} طلب بنجاح`,
      ordersCount: updatedCount,
      totalAmount: totalAmount.toFixed(2),
      updatedOrders: ordersToUpdate.map(order => ({
        order_id: order.order_id,
        total_price: order.total_price,
        created_at: order.created_at
      }))
    };

  } catch (error) {
    console.error('Error requesting orders settlement:', error);
    throw error;
  }
};

// التابع لطلب تصفير الطلبات
exports.requestOrdersSettlement = async (req, res) => {
  try {
    const { store_id } = req.params;
    
    console.log('requestOrdersSettlement called for store_id:', store_id);
    
    const result = await requestOrdersSettlement(store_id);

    if (result.success) {
      res.status(200).json({
        success: true,
        data: result
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message
      });
    }

  } catch (error) {
    console.error('Error in requestOrdersSettlement:', error);
    res.status(500).json({ 
      success: false,
      error: 'حدث خطأ في السيرفر',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// دالة مساعدة للموافقة على التصفير
const approveOrdersSettlement = async (store_id, admin_id = null) => {
  try {
    if (!Order) {
      throw new Error('Order model is not defined');
    }

    console.log('Approving settlement for store:', store_id);

    // البحث عن جميع الطلبات التي تم طلب تصفيرها
    const ordersToSettle = await Order.findAll({
      where: {
        store_id: store_id,
        settlement_status: 'settlement_requested'
      }
    });

    console.log('Found orders to settle:', ordersToSettle.length);

    if (ordersToSettle.length === 0) {
      return {
        success: false,
        message: 'لا توجد طلبات في انتظار الموافقة على التصفير',
        ordersCount: 0
      };
    }

    // حساب إجمالي المبلغ المراد تصفيره
    const totalAmount = ordersToSettle.reduce((sum, order) => {
      return sum + parseFloat(order.total_price || 0);
    }, 0);

    // تحديث جميع الطلبات إلى حالة "تم التصفير"
    const [updatedCount] = await Order.update(
      {
        settlement_status: 'settled',
        settled_at: new Date()
      },
      {
        where: {
          store_id: store_id,
          settlement_status: 'settlement_requested'
        }
      }
    );

    console.log('Settled orders count:', updatedCount);

    return {
      success: true,
      message: `تم الموافقة على تصفير ${updatedCount} طلب بإجمالي ${totalAmount.toFixed(2)}`,
      ordersCount: updatedCount,
      totalAmount: totalAmount.toFixed(2),
      settledOrders: ordersToSettle.map(order => ({
        order_id: order.order_id,
        total_price: order.total_price,
        created_at: order.created_at,
        settlement_requested_at: order.settlement_requested_at
      }))
    };

  } catch (error) {
    console.error('Error approving orders settlement:', error);
    throw error;
  }
};

// التابع للموافقة على التصفير (للأدمن)
exports.approveOrdersSettlement = async (req, res) => {
  try {
    const { store_id } = req.params;
    const admin_id = req.user?.user_id; // من middleware المصادقة

    console.log('approveOrdersSettlement called for store_id:', store_id, 'by admin_id:', admin_id);

    // تحديث جميع الطلبات التي طلبت التصفير إلى تم الرصد
    const [updatedCount] = await Order.update(
      {
        settlement_status: 'settled',          // حالة التصفير أصبحت تم الرصد
        status: 'monitored',                    // تحديث الحالة إلى تم الرصد
        settlement_approved_at: new Date(),    // تخزين وقت الموافقة
        settlement_approved_by: admin_id       // تخزين رقم الأدمن الذي وافق
      },
      {
        where: {
          store_id,
          settlement_status: 'settlement_requested'
        }
      }
    );

    if (updatedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'لا توجد طلبات معلقة للتصفير لهذا المتجر أو تم تصفيرها مسبقًا'
      });
    }

    res.status(200).json({
      success: true,
      message: `تم تحديث ${updatedCount} طلب/طلبات إلى تم الرصد بنجاح`,
      updatedOrders: updatedCount
    });

  } catch (error) {
    console.error('Error in approveOrdersSettlement:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في السيرفر أثناء الموافقة على التصفير',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// دالة للحصول على الطلبات حسب حالة التصفير مع pagination
exports.getOrdersBySettlementStatus = async (req, res) => {
  try {
    const { store_id } = req.params;
    const { 
      settlement_status, 
      page = 1, 
      limit = 10,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = req.query;

    console.log('getOrdersBySettlementStatus called:', { store_id, settlement_status, page, limit });

    if (!Order) {
      throw new Error('Order model is not defined');
    }

    const offset = (page - 1) * limit;
    const whereCondition = { store_id: store_id };

    // إضافة فلتر حالة التصفير إذا تم تحديده
    if (settlement_status) {
      whereCondition.settlement_status = settlement_status;
    }

    // بناء ترتيب الاستعلام
    const orderArray = [];
    if (sort_by === 'total_price') {
      orderArray.push(['total_price', sort_order.toUpperCase()]);
    } else if (sort_by === 'settlement_requested_at') {
      orderArray.push(['settlement_requested_at', sort_order.toUpperCase()]);
    } else if (sort_by === 'settled_at') {
      orderArray.push(['settled_at', sort_order.toUpperCase()]);
    } else {
      orderArray.push(['created_at', sort_order.toUpperCase()]);
    }

    const { count, rows } = await Order.findAndCountAll({
      where: whereCondition,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: orderArray,
      attributes: [
        'order_id',
        'purchase_id',
        'total_price',
        'status',
        'settlement_status',
        'settlement_requested_at',
        'settled_at',
        'created_at'
      ]
    });

    // حساب إحصائيات سريعة للصفحة الحالية
    const currentPageStats = {
      count: rows.length,
      total_amount: rows.reduce((sum, order) => sum + parseFloat(order.total_price), 0).toFixed(2)
    };

    res.status(200).json({
      success: true,
      data: {
        orders: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit)
        },
        current_page_stats: currentPageStats,
        filters_applied: {
          store_id,
          settlement_status: settlement_status || 'all',
          sort_by,
          sort_order
        }
      }
    });

  } catch (error) {
    console.error('Error in getOrdersBySettlementStatus:', error);
    res.status(500).json({ 
      success: false,
      error: 'حدث خطأ في السيرفر',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};