const db = require('../models');

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
    const shipping = await db.Shipping.findOne({
      where: { purchase_id: purchase_id }
    });
    
    if (!shipping) {
      await transaction.rollback();
      return res.status(404).json({ error: 'معلومات الشحن غير موجودة لهذا المعرف' });
    }
    
    // العثور على السلة باستخدام customer_session_id
    const cart = await db.Cart.findOne({
      where: { session_id: shipping.customer_session_id },
      include: [{
        model: db.CartItem,
        include: [{ model: db.Product }]
      }]
    });
    
    if (!cart || !cart.CartItems || cart.CartItems.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ error: 'السلة فارغة أو غير موجودة' });
    }
    
    // التحقق من عدم وجود طلبات مسبقة لنفس purchase_id
    const existingOrders = await db.Order.findAll({
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
      const store = await db.Store.findByPk(store_id);
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
      const order = await db.Order.create({
        store_id: parseInt(store_id),
        purchase_id: purchase_id,
        customer_session_id: shipping.customer_session_id,
        total_price: store_total_price,
        status: 'pending', // حالة معلقة بدلاً من confirmed
        is_programmatic: false
      }, { transaction });
      
      // إضافة عناصر الطلب
      for (const item of orderItems) {
        await db.OrderItem.create({
          order_id: order.order_id,
          ...item
        }, { transaction });
        
        // نقص المخزون فوراً (سيتم تعديل هذا لاحقاً عند إضافة الدفع)
        const product = await db.Product.findByPk(item.product_id);
        await product.update({
          stock_quantity: product.stock_quantity - item.quantity
        }, { transaction });
      }
      
      createdOrders.push(order.order_id);
    }
    
    // تنظيف السلة بعد إنشاء الطلبات
    await db.CartItem.destroy({
      where: { cart_id: cart.cart_id }
    }, { transaction });
    
    await transaction.commit();
    
    // إرجاع جميع الطلبات المُنشأة مع التفاصيل
    const ordersWithDetails = await db.Order.findAll({
      where: {
        order_id: createdOrders
      },
      include: [
        {
          model: db.OrderItem,
          include: [{ model: db.Product }]
        },
        { model: db.Store }
      ]
    });
    
    // العثور على معلومات الشحن مرة أخرى لإرجاعها
    const finalShipping = await db.Shipping.findOne({
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
        }
      ],
      order: [['created_at', 'DESC']]
    });

    // إحضار معلومات الشحن باستخدام purchase_id الصحيح
    const ordersWithShipping = await Promise.all(
      orders.map(async (order) => {
        const shipping = await db.Shipping.findOne({
          where: { purchase_id: order.purchase_id } // استخدم purchase_id من الطلب وليس order_id
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
          attributes: ['store_name', 'logo_image', 'store_address']
        },
        {
          model: db.OrderItem,
          include: [{ model: db.Product }] // بدون تحديد attributes
        }
      ],
      order: [['created_at', 'DESC']]
    });

    // جلب الطلبات المشحونة فقط
    const shippedOrders = await db.Order.findAll({
      where: { 
        store_id: storeId,
        status: 'shipped' 
      },
      include: [
        {
          model: db.Store,
          attributes: ['store_name', 'logo_image', 'store_address']
        },
        {
          model: db.OrderItem,
          include: [{ model: db.Product }]
        }
      ],
      order: [['created_at', 'DESC']]
    });

    // جلب الطلبات غير المشحونة
    const unshippedOrders = await db.Order.findAll({
      where: { 
        store_id: storeId,
        status: {
          [db.Sequelize.Op.ne]: 'shipped'
        }
      },
      include: [
        {
          model: db.Store,
          attributes: ['store_name', 'logo_image', 'store_address']
        },
        {
          model: db.OrderItem,
          include: [{ model: db.Product }]
        }
      ],
      order: [['created_at', 'DESC']]
    });

    // دالة لتنسيق الطلبات وإضافة معلومات الشحن
    const formatOrders = async (orders) => {
      const formattedOrders = await Promise.all(orders.map(async (order) => {
        const orderData = order.toJSON();
        
        // إضافة معلومات الشحن باستخدام purchase_id
        if (orderData.purchase_id) {
          try {
            const shippingInfo = await db.Shipping.findOne({
              where: { purchase_id: orderData.purchase_id }
            });
            
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
        
        return orderData;
      }));
      
      return formattedOrders;
    };

    // تطبيق التنسيق
    const formattedAllOrders = await formatOrders(allOrders);
    const formattedShippedOrders = await formatOrders(shippedOrders);
    const formattedUnshippedOrders = await formatOrders(unshippedOrders);

    // التحقق من وجود طلبات
    if (allOrders.length === 0) {
      return res.status(200).json({
        message: 'لا توجد طلبات لهذا المتجر',
        storeId: parseInt(storeId),
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

    // حساب المبالغ
    const totalAllOrdersAmount = allOrders.reduce((sum, order) => {
      return sum + parseFloat(order.total_price || 0);
    }, 0);

    const totalShippedOrdersAmount = shippedOrders.reduce((sum, order) => {
      return sum + parseFloat(order.total_price || 0);
    }, 0);

    const totalUnshippedOrdersAmount = unshippedOrders.reduce((sum, order) => {
      return sum + parseFloat(order.total_price || 0);
    }, 0);

    // الاستجابة النهائية
    const response = {
      storeId: parseInt(storeId),
      storeName: allOrders[0]?.Store?.store_name || 'غير محدد',
      allOrders: {
        orders: formattedAllOrders,
        count: allOrders.length,
        totalAmount: parseFloat(totalAllOrdersAmount.toFixed(2))
      },
      shippedOrders: {
        orders: formattedShippedOrders,
        count: shippedOrders.length,
        totalAmount: parseFloat(totalShippedOrdersAmount.toFixed(2))
      },
      unshippedOrders: {
        orders: formattedUnshippedOrders,
        count: unshippedOrders.length,
        totalAmount: parseFloat(totalUnshippedOrdersAmount.toFixed(2))
      },
      statistics: {
        totalOrders: allOrders.length,
        shippedCount: shippedOrders.length,
        unshippedCount: unshippedOrders.length,
        shippedPercentage: allOrders.length > 0 ? parseFloat(((shippedOrders.length / allOrders.length) * 100).toFixed(2)) : 0,
        unshippedPercentage: allOrders.length > 0 ? parseFloat(((unshippedOrders.length / allOrders.length) * 100).toFixed(2)) : 0,
        totalRevenue: parseFloat(totalAllOrdersAmount.toFixed(2)),
        shippedRevenue: parseFloat(totalShippedOrdersAmount.toFixed(2)),
        unshippedRevenue: parseFloat(totalUnshippedOrdersAmount.toFixed(2)),
        averageOrderValue: allOrders.length > 0 ? parseFloat((totalAllOrdersAmount / allOrders.length).toFixed(2)) : 0,
        revenuePercentageShipped: totalAllOrdersAmount > 0 ? parseFloat(((totalShippedOrdersAmount / totalAllOrdersAmount) * 100).toFixed(2)) : 0,
        revenuePercentageUnshipped: totalAllOrdersAmount > 0 ? parseFloat(((totalUnshippedOrdersAmount / totalAllOrdersAmount) * 100).toFixed(2)) : 0
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

// التابع الثاني: تغيير حالة الطلب من غير مشحونة إلى مشحونة
exports.updateOrderToShipped = async (req, res) => {
  try {
    const { id } = req.params; // تغيير من order_id إلى id
    const order_id = id; // للحفاظ على باقي الكود

    // للتأكد من وصول المعامل بشكل صحيح
    console.log('Order ID from params:', id);
    console.log('All params:', req.params);

    if (!id) {
      return res.status(400).json({ error: 'معرف الطلب مطلوب' });
    }

    // جلب الطلب بدون include للـ Shipping
    const order = await db.Order.findByPk(order_id, {
      include: [
        {
          model: db.Store,
          attributes: ['store_name', 'logo_image', 'store_address']
        },
        {
          model: db.OrderItem,
          include: [{ model: db.Product }]
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
        shippingInfo = await db.Shipping.findOne({
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


exports.filterStoreOrders = async (req, res) => {
  try {
    const { store_id } = req.params;
    const { 
      customerName,     // اسم الزبون
      productName,      // اسم المنتج
      orderStatus,      // حالة الطلب
      shippingStatus,   // حالة الشحن
      dateFrom,         // من تاريخ
      dateTo,           // إلى تاريخ
      page = 1,         // رقم الصفحة
      limit = 20        // عدد الطلبات في الصفحة
    } = req.query;

    // جلب بيانات المتجر مع صاحب المتجر
    const store = await db.Store.findByPk(store_id, {
      include: [
        {
          model: db.User,
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
        whereConditions.created_at[db.Sequelize.Op.gte] = new Date(dateFrom);
      }
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        whereConditions.created_at[db.Sequelize.Op.lte] = endDate;
      }
    }

    // إذا كان هناك بحث بالزبون أو المنتج، نحتاج لاستعلامات فرعية
    if (customerName && customerName.trim()) {
      // البحث في جدول الشحن عن اسم الزبون
      const shippingOrderIds = await db.Shipping.findAll({
        where: {
          [db.Sequelize.Op.or]: [
            {
              customer_name: {
                [db.Sequelize.Op.like]: `%${customerName.trim()}%`
              }
            },
            {
              recipient_name: {
                [db.Sequelize.Op.like]: `%${customerName.trim()}%`
              }
            }
          ]
        },
        attributes: ['order_id']
      });

      const orderIds = shippingOrderIds.map(s => s.order_id);
      if (orderIds.length === 0) {
        // لا توجد طلبات تطابق اسم الزبون
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

      whereConditions.order_id = {
        [db.Sequelize.Op.in]: orderIds
      };
    }

    if (productName && productName.trim()) {
      // البحث في المنتجات ثم في OrderItems
      const products = await db.Product.findAll({
        where: {
          name: {
            [db.Sequelize.Op.like]: `%${productName.trim()}%`
          }
        },
        attributes: ['product_id']
      });

      const productIds = products.map(p => p.product_id);
      if (productIds.length === 0) {
        // لا توجد منتجات تطابق الاسم
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

      const orderItems = await db.OrderItem.findAll({
        where: {
          product_id: {
            [db.Sequelize.Op.in]: productIds
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
          [db.Sequelize.Op.and]: [
            whereConditions.order_id,
            { [db.Sequelize.Op.in]: orderIds }
          ]
        };
      } else {
        whereConditions.order_id = {
          [db.Sequelize.Op.in]: orderIds
        };
      }
    }

    // حساب offset للتصفح
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // جلب الطلبات الأساسية
    const { count, rows: orders } = await db.Order.findAndCountAll({
      where: whereConditions,
      limit: parseInt(limit),
      offset: offset,
      order: [['created_at', 'DESC']]
    });

    // جلب بيانات الشحن للطلبات
    const orderIds = orders.map(order => order.order_id);
    const shippingData = {};
    if (orderIds.length > 0) {
      const shippings = await db.Shipping.findAll({
        where: {
          order_id: {
            [db.Sequelize.Op.in]: orderIds
          }
        }
      });

      // فلترة إضافية حسب حالة الشحن إذا كانت مطلوبة
      const filteredShippings = shippingStatus 
        ? shippings.filter(s => s.shipping_status === shippingStatus.trim())
        : shippings;

      filteredShippings.forEach(shipping => {
        shippingData[shipping.order_id] = shipping;
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
      const orderItems = await db.OrderItem.findAll({
        where: {
          order_id: {
            [db.Sequelize.Op.in]: orderIds
          }
        },
        include: [
          {
            model: db.Product,
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
          averageRating: 0, // سيتم حسابه لاحقاً
          reviewsCount: 0,
          stockStatus: 'متوفر',
          // معلومات إضافية خاصة بالطلب
          order_id: orderData.order_id,
          order_status: orderData.status,
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
      const reviews = await db.Review.findAll({
        where: {
          product_id: {
            [db.Sequelize.Op.in]: productIds
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
    const orderStats = await db.Order.findAll({
      where: { store_id },
      attributes: [
        [db.sequelize.fn('COUNT', db.sequelize.col('order_id')), 'totalOrders'],
        [db.sequelize.fn('SUM', db.sequelize.col('total_price')), 'totalRevenue'],
        [db.sequelize.fn('AVG', db.sequelize.col('total_price')), 'averageOrderValue']
      ],
      raw: true
    });

    // إحصائيات الطلبات حسب الحالة
    const ordersByStatus = await db.Order.findAll({
      where: { store_id },
      attributes: [
        'status',
        [db.sequelize.fn('COUNT', db.sequelize.col('order_id')), 'count']
      ],
      group: ['status'],
      raw: true
    });

    // إحصائيات المنتجات
    const productStats = await db.Product.findAll({
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
    const reviewStats = await db.Review.findAll({
      include: [
        {
          model: db.Product,
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

// تابع مساعد للحصول على إحصائيات الطلبات (محدث)
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

// دالة مساعدة لحساب إحصائيات التصفير
const calculateSettlementStatistics = async (store_id) => {
  try {
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
          count: parseInt(stat.count),
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