const db = require('../models');

// إضافة عنصر للطلب
exports.addOrderItem = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    const { order_id, product_id, quantity, price_at_time } = req.body;

    if (!order_id || !product_id || !quantity) {
      await transaction.rollback();
      return res.status(400).json({ error: 'معرف الطلب ومعرف المنتج والكمية مطلوبة' });
    }

    if (quantity < 1) {
      await transaction.rollback();
      return res.status(400).json({ error: 'الكمية يجب أن تكون أكبر من صفر' });
    }

    // التحقق من وجود الطلب
    const order = await db.Order.findByPk(order_id, {
      include: [{ model: db.Store, as: 'Store' }],
      transaction
    });

    if (!order) {
      await transaction.rollback();
      return res.status(404).json({ error: 'الطلب غير موجود' });
    }

    // التحقق من حالة الطلب
    if (!['pending', 'confirmed'].includes(order.status)) {
      await transaction.rollback();
      return res.status(400).json({ error: 'لا يمكن تعديل طلب في هذه الحالة' });
    }

    // التحقق من ملكية المتجر
    if (req.user && order.Store.user_id !== req.user.user_id && req.user.role !== 'admin') {
      await transaction.rollback();
      return res.status(403).json({ error: 'غير مصرح لك بتعديل هذا الطلب' });
    }

    // التحقق من وجود المنتج
    const product = await db.Product.findByPk(product_id, { transaction });
    if (!product) {
      await transaction.rollback();
      return res.status(404).json({ error: 'المنتج غير موجود' });
    }

    // التحقق من توفر المخزون
    if (product.stock_quantity < quantity) {
      await transaction.rollback();
      return res.status(400).json({ error: `المخزون غير كافي. المتوفر: ${product.stock_quantity}` });
    }

    // استخدام السعر الحالي إذا لم يتم تحديد السعر
    const finalPrice = price_at_time || product.price;

    // التحقق من وجود العنصر في الطلب مسبقاً
    const existingOrderItem = await db.OrderItem.findOne({
      where: { order_id, product_id },
      transaction
    });

    if (existingOrderItem) {
      await transaction.rollback();
      return res.status(400).json({ error: 'المنتج موجود مسبقاً في الطلب. استخدم تحديث الكمية بدلاً من ذلك' });
    }

    // إنشاء عنصر الطلب
    const orderItem = await db.OrderItem.create({
      order_id,
      product_id,
      quantity,
      price_at_time: finalPrice
    }, { transaction });

    // تحديث المخزون
    await product.update({
      stock_quantity: product.stock_quantity - quantity
    }, { transaction });

    // تحديث إجمالي سعر الطلب
    const itemTotal = finalPrice * quantity;
    await order.update({
      total_price: parseFloat(order.total_price) + itemTotal
    }, { transaction });

    await transaction.commit();

    // إرجاع العنصر مع تفاصيل المنتج
    const orderItemWithProduct = await db.OrderItem.findByPk(orderItem.order_item_id, {
      include: [
        {
          model: db.Product,
          as: 'Product',
          include: [
            {
              model: db.Store,
              as: 'Store',
              attributes: ['store_name', 'logo_image']
            }
          ]
        },
        {
          model: db.Order,
          as: 'Order',
          attributes: ['order_id', 'status', 'total_price']
        }
      ]
    });

    // تنسيق صور المنتج
    if (orderItemWithProduct.Product && orderItemWithProduct.Product.images) {
      orderItemWithProduct.Product.images = JSON.parse(orderItemWithProduct.Product.images || '[]');
    }

    res.status(201).json({
      message: 'تم إضافة المنتج للطلب بنجاح',
      orderItem: orderItemWithProduct
    });
  } catch (error) {
    await transaction.rollback();
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على جميع عناصر الطلبات
exports.getAllOrderItems = async (req, res) => {
  try {
    const { order_id, product_id, store_id, page = 1, limit = 10 } = req.query;
    let whereClause = {};
    let includeWhere = {};

    if (order_id) {
      whereClause.order_id = order_id;
    }

    if (product_id) {
      whereClause.product_id = product_id;
    }

    if (store_id) {
      includeWhere.store_id = store_id;
    }

    const offset = (page - 1) * limit;

    const { count, rows: orderItems } = await db.OrderItem.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: db.Order,
          as: 'Order',
          where: includeWhere,
          attributes: ['order_id', 'status', 'total_price', 'created_at'],
          include: [
            {
              model: db.Store,
              as: 'Store',
              attributes: ['store_name', 'logo_image']
            }
          ]
        },
        {
          model: db.Product,
          as: 'Product',
          attributes: ['product_id', 'name', 'price', 'images', 'stock_quantity']
        }
      ],
      order: [['order_item_id', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // تنسيق صور المنتجات
    const formattedOrderItems = orderItems.map(item => {
      if (item.Product && item.Product.images) {
        item.Product.images = JSON.parse(item.Product.images || '[]');
      }
      return item;
    });

    res.status(200).json({
      orderItems: formattedOrderItems,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على عنصر طلب بواسطة المعرف
exports.getOrderItemById = async (req, res) => {
  try {
    const orderItem = await db.OrderItem.findByPk(req.params.id, {
      include: [
        {
          model: db.Order,
          as: 'Order',
          include: [
            {
              model: db.Store,
              as: 'Store',
              attributes: ['store_name', 'logo_image', 'store_address']
            },
            {
              model: db.Shipping,
              as: 'Shipping',
              required: false
            }
          ]
        },
        {
          model: db.Product,
          as: 'Product',
          include: [
            {
              model: db.Store,
              as: 'Store',
              attributes: ['store_name']
            }
          ]
        }
      ]
    });

    if (!orderItem) {
      return res.status(404).json({ error: 'عنصر الطلب غير موجود' });
    }

    // تنسيق صور المنتج
    if (orderItem.Product && orderItem.Product.images) {
      orderItem.Product.images = JSON.parse(orderItem.Product.images || '[]');
    }

    res.status(200).json(orderItem);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// تحديث كمية عنصر في الطلب
exports.updateOrderItem = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { quantity, price_at_time } = req.body;

    if (!quantity || quantity < 1) {
      await transaction.rollback();
      return res.status(400).json({ error: 'الكمية يجب أن تكون أكبر من صفر' });
    }

    const orderItem = await db.OrderItem.findByPk(req.params.id, {
      include: [
        {
          model: db.Order,
          as: 'Order',
          include: [{ model: db.Store, as: 'Store' }]
        },
        {
          model: db.Product,
          as: 'Product'
        }
      ],
      transaction
    });

    if (!orderItem) {
      await transaction.rollback();
      return res.status(404).json({ error: 'عنصر الطلب غير موجود' });
    }

    // التحقق من حالة الطلب
    if (!['pending', 'confirmed'].includes(orderItem.Order.status)) {
      await transaction.rollback();
      return res.status(400).json({ error: 'لا يمكن تعديل طلب في هذه الحالة' });
    }

    // التحقق من ملكية المتجر
    if (req.user && orderItem.Order.Store.user_id !== req.user.user_id && req.user.role !== 'admin') {
      await transaction.rollback();
      return res.status(403).json({ error: 'غير مصرح لك بتعديل هذا الطلب' });
    }

    // حساب التغيير في المخزون
    const quantityDifference = quantity - orderItem.quantity;
    
    // التحقق من توفر المخزون إذا كانت الكمية تزيد
    if (quantityDifference > 0) {
      if (orderItem.Product.stock_quantity < quantityDifference) {
        await transaction.rollback();
        return res.status(400).json({ 
          error: `المخزون غير كافي. المتوفر: ${orderItem.Product.stock_quantity}` 
        });
      }
    }

    // حساب الفرق في السعر الإجمالي
    const oldTotal = orderItem.price_at_time * orderItem.quantity;
    const newPrice = price_at_time || orderItem.price_at_time;
    const newTotal = newPrice * quantity;
    const priceDifference = newTotal - oldTotal;

    // تحديث المخزون
    await orderItem.Product.update({
      stock_quantity: orderItem.Product.stock_quantity - quantityDifference
    }, { transaction });

    // تحديث عنصر الطلب
    await orderItem.update({
      quantity,
      price_at_time: newPrice
    }, { transaction });

    // تحديث إجمالي سعر الطلب
    await orderItem.Order.update({
      total_price: parseFloat(orderItem.Order.total_price) + priceDifference
    }, { transaction });

    await transaction.commit();

    // إرجاع العنصر المحدث مع تفاصيل المنتج
    const updatedOrderItem = await db.OrderItem.findByPk(req.params.id, {
      include: [
        {
          model: db.Product,
          as: 'Product',
          include: [
            {
              model: db.Store,
              as: 'Store',
              attributes: ['store_name', 'logo_image']
            }
          ]
        },
        {
          model: db.Order,
          as: 'Order',
          attributes: ['order_id', 'status', 'total_price']
        }
      ]
    });

    // تنسيق صور المنتج
    if (updatedOrderItem.Product && updatedOrderItem.Product.images) {
      updatedOrderItem.Product.images = JSON.parse(updatedOrderItem.Product.images || '[]');
    }

    res.status(200).json({
      message: 'تم تحديث عنصر الطلب بنجاح',
      orderItem: updatedOrderItem
    });
  } catch (error) {
    await transaction.rollback();
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// حذف عنصر من الطلب
exports.deleteOrderItem = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const orderItem = await db.OrderItem.findByPk(req.params.id, {
      include: [
        {
          model: db.Order,
          as: 'Order',
          include: [{ model: db.Store, as: 'Store' }]
        },
        {
          model: db.Product,
          as: 'Product'
        }
      ],
      transaction
    });

    if (!orderItem) {
      await transaction.rollback();
      return res.status(404).json({ error: 'عنصر الطلب غير موجود' });
    }

    // التحقق من حالة الطلب
    if (!['pending', 'confirmed'].includes(orderItem.Order.status)) {
      await transaction.rollback();
      return res.status(400).json({ error: 'لا يمكن حذف عنصر من طلب في هذه الحالة' });
    }

    // التحقق من ملكية المتجر
    if (req.user && orderItem.Order.Store.user_id !== req.user.user_id && req.user.role !== 'admin') {
      await transaction.rollback();
      return res.status(403).json({ error: 'غير مصرح لك بتعديل هذا الطلب' });
    }

    // حساب السعر المُراد خصمه
    const itemTotal = orderItem.price_at_time * orderItem.quantity;

    // إرجاع المنتجات للمخزون
    await orderItem.Product.update({
      stock_quantity: orderItem.Product.stock_quantity + orderItem.quantity
    }, { transaction });

    // تحديث إجمالي سعر الطلب
    const newTotal = parseFloat(orderItem.Order.total_price) - itemTotal;
    await orderItem.Order.update({
      total_price: Math.max(newTotal, 0)
    }, { transaction });

    // حذف العنصر
    await orderItem.destroy({ transaction });

    await transaction.commit();

    res.status(200).json({ 
      message: 'تم حذف العنصر من الطلب بنجاح',
      removedTotal: itemTotal,
      restoredStock: orderItem.quantity
    });
  } catch (error) {
    await transaction.rollback();
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على عناصر طلب معين مع الإجمالي
exports.getOrderItemsWithTotal = async (req, res) => {
  try {
    const { order_id } = req.params;

    // التحقق من وجود الطلب
    const order = await db.Order.findByPk(order_id, {
      include: [{ model: db.Store, as: 'Store' }]
    });

    if (!order) {
      return res.status(404).json({ error: 'الطلب غير موجود' });
    }

    const orderItems = await db.OrderItem.findAll({
      where: { order_id },
      include: [
        {
          model: db.Product,
          as: 'Product',
          include: [
            {
              model: db.Store,
              as: 'Store',
              attributes: ['store_name', 'logo_image']
            }
          ]
        }
      ],
      order: [['order_item_id', 'ASC']]
    });

    if (orderItems.length === 0) {
      return res.status(200).json({
        order: {
          order_id: order.order_id,
          status: order.status,
          store: order.Store
        },
        items: [],
        total: 0,
        itemsCount: 0
      });
    }

    let total = 0;
    let itemsCount = 0;

    const formattedItems = orderItems.map(item => {
      // تنسيق صور المنتج
      if (item.Product && item.Product.images) {
        item.Product.images = JSON.parse(item.Product.images || '[]');
      }

      const itemTotal = item.price_at_time * item.quantity;
      total += itemTotal;
      itemsCount += item.quantity;

      return {
        ...item.toJSON(),
        item_total: parseFloat(itemTotal.toFixed(2))
      };
    });

    res.status(200).json({
      order: {
        order_id: order.order_id,
        status: order.status,
        store: order.Store
      },
      items: formattedItems,
      total: parseFloat(total.toFixed(2)),
      itemsCount
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// نسخ عناصر من طلب إلى طلب آخر
exports.copyOrderItems = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { from_order_id, to_order_id, copy_quantities = false } = req.body;

    if (!from_order_id || !to_order_id) {
      await transaction.rollback();
      return res.status(400).json({ error: 'معرفات الطلب المصدر والهدف مطلوبة' });
    }

    if (from_order_id === to_order_id) {
      await transaction.rollback();
      return res.status(400).json({ error: 'لا يمكن نسخ الطلب إلى نفسه' });
    }

    // التحقق من وجود الطلبين
    const fromOrder = await db.Order.findByPk(from_order_id, {
      include: [{ model: db.Store, as: 'Store' }],
      transaction
    });

    const toOrder = await db.Order.findByPk(to_order_id, {
      include: [{ model: db.Store, as: 'Store' }],
      transaction
    });

    if (!fromOrder || !toOrder) {
      await transaction.rollback();
      return res.status(404).json({ error: 'أحد الطلبين غير موجود' });
    }

    // التحقق من حالة الطلب الهدف
    if (!['pending', 'confirmed'].includes(toOrder.status)) {
      await transaction.rollback();
      return res.status(400).json({ error: 'لا يمكن إضافة عناصر لطلب في هذه الحالة' });
    }

    // التحقق من ملكية المتاجر
    if (req.user && req.user.role !== 'admin') {
      if (fromOrder.Store.user_id !== req.user.user_id || toOrder.Store.user_id !== req.user.user_id) {
        await transaction.rollback();
        return res.status(403).json({ error: 'غير مصرح لك بتعديل هذه الطلبات' });
      }
    }

    // الحصول على عناصر الطلب المصدر
    const orderItems = await db.OrderItem.findAll({
      where: { order_id: from_order_id },
      include: [{ model: db.Product, as: 'Product' }],
      transaction
    });

    if (orderItems.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ error: 'الطلب المصدر فارغ' });
    }

    let totalAdded = 0;
    const copiedItems = [];
    const skippedItems = [];

    for (const item of orderItems) {
      // التحقق من وجود المنتج في الطلب الهدف
      const existingItem = await db.OrderItem.findOne({
        where: {
          order_id: to_order_id,
          product_id: item.product_id
        },
        transaction
      });

      if (!existingItem) {
        // التحقق من توفر المخزون
        const quantity = copy_quantities ? item.quantity : 1;
        if (item.Product.stock_quantity >= quantity) {
          // إنشاء عنصر جديد
          const newItem = await db.OrderItem.create({
            order_id: to_order_id,
            product_id: item.product_id,
            quantity: quantity,
            price_at_time: item.price_at_time
          }, { transaction });

          // تحديث المخزون
          await item.Product.update({
            stock_quantity: item.Product.stock_quantity - quantity
          }, { transaction });

          const itemTotal = item.price_at_time * quantity;
          totalAdded += itemTotal;
          copiedItems.push({
            product_id: item.product_id,
            product_name: item.Product.name,
            quantity: quantity,
            price: item.price_at_time,
            total: itemTotal
          });
        } else {
          skippedItems.push({
            product_id: item.product_id,
            product_name: item.Product.name,
            reason: 'مخزون غير كافي',
            available: item.Product.stock_quantity,
            requested: quantity
          });
        }
      } else {
        skippedItems.push({
          product_id: item.product_id,
          product_name: item.Product.name,
          reason: 'موجود مسبقاً في الطلب الهدف'
        });
      }
    }

    // تحديث إجمالي سعر الطلب الهدف
    if (totalAdded > 0) {
      await toOrder.update({
        total_price: parseFloat(toOrder.total_price) + totalAdded
      }, { transaction });
    }

    await transaction.commit();

    res.status(200).json({
      message: 'تم نسخ العناصر بنجاح',
      summary: {
        copiedItems: copiedItems.length,
        skippedItems: skippedItems.length,
        totalAdded: parseFloat(totalAdded.toFixed(2))
      },
      details: {
        copied: copiedItems,
        skipped: skippedItems
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// إحصائيات عناصر الطلبات (للمسؤولين)
exports.getOrderItemsStats = async (req, res) => {
  try {
    // التحقق من صلاحية المسؤول
    if (req.user && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'غير مصرح لك بعرض إحصائيات عناصر الطلبات' });
    }

    const totalOrderItems = await db.OrderItem.count();

    // أكثر المنتجات طلباً
    const topProducts = await db.OrderItem.findAll({
      attributes: [
        'product_id',
        [db.sequelize.fn('SUM', db.sequelize.col('quantity')), 'total_quantity'],
        [db.sequelize.fn('COUNT', db.sequelize.col('order_item_id')), 'orders_count'],
        [db.sequelize.literal('SUM(price_at_time * quantity)'), 'total_revenue']
      ],
      include: [
        {
          model: db.Product,
          as: 'Product',
          attributes: ['name', 'price', 'images']
        }
      ],
      group: ['product_id', 'Product.product_id'],
      order: [[db.sequelize.fn('SUM', db.sequelize.col('quantity')), 'DESC']],
      limit: 10
    });

    // متوسط كمية المنتجات في الطلب
    const avgQuantityResult = await db.OrderItem.findOne({
      attributes: [
        [db.sequelize.fn('AVG', db.sequelize.col('quantity')), 'avg_quantity']
      ]
    });

    // إجمالي قيمة جميع عناصر الطلبات
    const totalValueResult = await db.OrderItem.findOne({
      attributes: [
        [db.sequelize.literal('SUM(price_at_time * quantity)'), 'total_value']
      ]
    });

    const stats = {
      totalOrderItems,
      averageQuantity: parseFloat(avgQuantityResult.dataValues.avg_quantity || 0).toFixed(2),
      totalValue: parseFloat(totalValueResult.dataValues.total_value || 0).toFixed(2),
      topProducts: topProducts.map(item => ({
        product: {
          product_id: item.product_id,
          name: item.Product.name,
          current_price: item.Product.price,
          images: JSON.parse(item.Product.images || '[]')
        },
        stats: {
          total_quantity: parseInt(item.dataValues.total_quantity),
          orders_count: parseInt(item.dataValues.orders_count),
          total_revenue: parseFloat(item.dataValues.total_revenue || 0).toFixed(2)
        }
      }))
    };

    res.status(200).json(stats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// البحث في عناصر الطلبات
exports.searchOrderItems = async (req, res) => {
  try {
    const { q, order_status, date_from, date_to, min_quantity, max_quantity } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'يجب أن يكون البحث حرفين على الأقل' });
    }

    let whereClause = {};
    let orderWhereClause = {};

    if (order_status) {
      orderWhereClause.status = order_status;
    }

    if (date_from) {
      orderWhereClause.created_at = {
        [db.Sequelize.Op.gte]: new Date(date_from)
      };
    }

    if (date_to) {
      orderWhereClause.created_at = {
        ...orderWhereClause.created_at,
        [db.Sequelize.Op.lte]: new Date(date_to)
      };
    }

    if (min_quantity || max_quantity) {
      whereClause.quantity = {};
      if (min_quantity) whereClause.quantity[db.Sequelize.Op.gte] = parseInt(min_quantity);
      if (max_quantity) whereClause.quantity[db.Sequelize.Op.lte] = parseInt(max_quantity);
    }

    const orderItems = await db.OrderItem.findAll({
      where: whereClause,
      include: [
        {
          model: db.Product,
          as: 'Product',
          where: {
            name: { [db.Sequelize.Op.like]: `%${q}%` }
          },
          include: [
            {
              model: db.Store,
              as: 'Store',
              attributes: ['store_name', 'logo_image']
            }
          ]
        },
        {
          model: db.Order,
          as: 'Order',
          where: orderWhereClause,
          attributes: ['order_id', 'status', 'created_at']
        }
      ],
      order: [['order_item_id', 'DESC']],
      limit: 20
    });

    // تنسيق صور المنتجات
    const formattedOrderItems = orderItems.map(item => {
      if (item.Product && item.Product.images) {
        item.Product.images = JSON.parse(item.Product.images || '[]');
      }
      return {
        ...item.toJSON(),
        item_total: parseFloat((item.price_at_time * item.quantity).toFixed(2))
      };
    });

    res.status(200).json(formattedOrderItems);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// حذف جميع عناصر طلب معين
exports.clearOrderItems = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { order_id } = req.params;

    // التحقق من وجود الطلب
    const order = await db.Order.findByPk(order_id, {
      include: [{ model: db.Store, as: 'Store' }],
      transaction
    });

    if (!order) {
      await transaction.rollback();
      return res.status(404).json({ error: 'الطلب غير موجود' });
    }

    // التحقق من حالة الطلب
    if (!['pending', 'confirmed'].includes(order.status)) {
      await transaction.rollback();
      return res.status(400).json({ error: 'لا يمكن مسح عناصر طلب في هذه الحالة' });
    }

    // التحقق من ملكية المتجر
    if (req.user && order.Store.user_id !== req.user.user_id && req.user.role !== 'admin') {
      await transaction.rollback();
      return res.status(403).json({ error: 'غير مصرح لك بتعديل هذا الطلب' });
    }

    // الحصول على جميع عناصر الطلب
    const orderItems = await db.OrderItem.findAll({
      where: { order_id },
      include: [{ model: db.Product, as: 'Product' }],
      transaction
    });

    if (orderItems.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ error: 'الطلب فارغ مسبقاً' });
    }

    // إرجاع المنتجات للمخزون وحذف العناصر
    for (const item of orderItems) {
      await item.Product.update({
        stock_quantity: item.Product.stock_quantity + item.quantity
      }, { transaction });

      await item.destroy({ transaction });
    }

    // إعادة تعيين إجمالي سعر الطلب
    await order.update({ total_price: 0 }, { transaction });

    await transaction.commit();

    res.status(200).json({
      message: 'تم مسح جميع عناصر الطلب بنجاح',
      clearedItems: orderItems.length,
      restoredStock: orderItems.reduce((total, item) => total + item.quantity, 0)
    });
  } catch (error) {
    await transaction.rollback();
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// تحديث عدة عناصر في طلب واحد
exports.updateMultipleOrderItems = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { order_id, items } = req.body;

    if (!order_id || !items || !Array.isArray(items) || items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ error: 'معرف الطلب وقائمة العناصر مطلوبة' });
    }

    // التحقق من وجود الطلب
    const order = await db.Order.findByPk(order_id, {
      include: [{ model: db.Store, as: 'Store' }],
      transaction
    });

    if (!order) {
      await transaction.rollback();
      return res.status(404).json({ error: 'الطلب غير موجود' });
    }

    // التحقق من حالة الطلب
    if (!['pending', 'confirmed'].includes(order.status)) {
      await transaction.rollback();
      return res.status(400).json({ error: 'لا يمكن تعديل طلب في هذه الحالة' });
    }

    // التحقق من ملكية المتجر
    if (req.user && order.Store.user_id !== req.user.user_id && req.user.role !== 'admin') {
      await transaction.rollback();
      return res.status(403).json({ error: 'غير مصرح لك بتعديل هذا الطلب' });
    }

    const updatedItems = [];
    const errors = [];
    let totalPriceChange = 0;

    for (const itemData of items) {
      try {
        const { order_item_id, quantity, price_at_time } = itemData;

        if (!order_item_id || !quantity || quantity < 1) {
          errors.push({ order_item_id, error: 'معرف العنصر والكمية مطلوبة' });
          continue;
        }

        const orderItem = await db.OrderItem.findByPk(order_item_id, {
          include: [{ model: db.Product, as: 'Product' }],
          transaction
        });

        if (!orderItem || orderItem.order_id !== parseInt(order_id)) {
          errors.push({ order_item_id, error: 'عنصر الطلب غير موجود أو لا ينتمي لهذا الطلب' });
          continue;
        }

        // حساب التغيير في المخزون
        const quantityDifference = quantity - orderItem.quantity;

        // التحقق من توفر المخزون إذا كانت الكمية تزيد
        if (quantityDifference > 0) {
          if (orderItem.Product.stock_quantity < quantityDifference) {
            errors.push({
              order_item_id,
              error: `المخزون غير كافي. المتوفر: ${orderItem.Product.stock_quantity}`
            });
            continue;
          }
        }

        // حساب الفرق في السعر الإجمالي
        const oldTotal = orderItem.price_at_time * orderItem.quantity;
        const newPrice = price_at_time || orderItem.price_at_time;
        const newTotal = newPrice * quantity;
        const priceDifference = newTotal - oldTotal;

        // تحديث المخزون
        await orderItem.Product.update({
          stock_quantity: orderItem.Product.stock_quantity - quantityDifference
        }, { transaction });

        // تحديث عنصر الطلب
        await orderItem.update({
          quantity,
          price_at_time: newPrice
        }, { transaction });

        totalPriceChange += priceDifference;
        updatedItems.push({
          order_item_id,
          product_name: orderItem.Product.name,
          old_quantity: orderItem.quantity - quantityDifference,
          new_quantity: quantity,
          old_price: orderItem.price_at_time !== newPrice ? orderItem.price_at_time : undefined,
          new_price: newPrice,
          price_change: priceDifference
        });
      } catch (error) {
        errors.push({ order_item_id: itemData.order_item_id, error: error.message });
      }
    }

    // تحديث إجمالي سعر الطلب
    if (totalPriceChange !== 0) {
      await order.update({
        total_price: parseFloat(order.total_price) + totalPriceChange
      }, { transaction });
    }

    await transaction.commit();

    res.status(200).json({
      message: 'تم تحديث العناصر بنجاح',
      summary: {
        updatedItems: updatedItems.length,
        errors: errors.length,
        totalPriceChange: parseFloat(totalPriceChange.toFixed(2)),
        newOrderTotal: parseFloat((parseFloat(order.total_price) + totalPriceChange).toFixed(2))
      },
      details: {
        updated: updatedItems,
        errors: errors
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على أكثر المنتجات مبيعاً
exports.getBestSellingProducts = async (req, res) => {
  try {
    const { limit = 10, date_from, date_to, store_id } = req.query;

    let orderWhereClause = {};
    let includeWhere = {};

    if (store_id) {
      includeWhere.store_id = store_id;
    }

    if (date_from) {
      orderWhereClause.created_at = {
        [db.Sequelize.Op.gte]: new Date(date_from)
      };
    }

    if (date_to) {
      orderWhereClause.created_at = {
        ...orderWhereClause.created_at,
        [db.Sequelize.Op.lte]: new Date(date_to)
      };
    }

    const bestSelling = await db.OrderItem.findAll({
      attributes: [
        'product_id',
        [db.sequelize.fn('SUM', db.sequelize.col('quantity')), 'total_sold'],
        [db.sequelize.fn('COUNT', db.sequelize.col('OrderItem.order_item_id')), 'total_orders'],
        [db.sequelize.literal('SUM(price_at_time * quantity)'), 'total_revenue'],
        [db.sequelize.fn('AVG', db.sequelize.col('price_at_time')), 'avg_price']
      ],
      include: [
        {
          model: db.Product,
          as: 'Product',
          attributes: ['name', 'price', 'images', 'stock_quantity'],
          include: [
            {
              model: db.Store,
              as: 'Store',
              where: includeWhere,
              attributes: ['store_name', 'logo_image']
            }
          ]
        },
        {
          model: db.Order,
          as: 'Order',
          where: orderWhereClause,
          attributes: []
        }
      ],
      group: ['product_id', 'Product.product_id', 'Product.Store.store_id'],
      order: [[db.sequelize.fn('SUM', db.sequelize.col('quantity')), 'DESC']],
      limit: parseInt(limit)
    });

    const formattedResults = bestSelling.map(item => ({
      product: {
        product_id: item.product_id,
        name: item.Product.name,
        current_price: item.Product.price,
        stock_quantity: item.Product.stock_quantity,
        images: JSON.parse(item.Product.images || '[]'),
        store: item.Product.Store
      },
      sales: {
        total_sold: parseInt(item.dataValues.total_sold),
        total_orders: parseInt(item.dataValues.total_orders),
        total_revenue: parseFloat(item.dataValues.total_revenue || 0).toFixed(2),
        avg_price: parseFloat(item.dataValues.avg_price || 0).toFixed(2)
      }
    }));

    res.status(200).json(formattedResults);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// تقرير مبيعات فترة زمنية
exports.getSalesReport = async (req, res) => {
  try {
    // التحقق من صلاحية المسؤول أو صاحب المتجر
    if (req.user && req.user.role !== 'admin') {
      const { store_id } = req.query;
      if (store_id) {
        const store = await db.Store.findByPk(store_id);
        if (!store || store.user_id !== req.user.user_id) {
          return res.status(403).json({ error: 'غير مصرح لك بعرض تقرير هذا المتجر' });
        }
      }
    }

    const { date_from, date_to, store_id, group_by = 'day' } = req.query;

    if (!date_from || !date_to) {
      return res.status(400).json({ error: 'تواريخ البداية والنهاية مطلوبة' });
    }

    let dateFormat;
    switch (group_by) {
      case 'hour':
        dateFormat = '%Y-%m-%d %H:00:00';
        break;
      case 'day':
        dateFormat = '%Y-%m-%d';
        break;
      case 'week':
        dateFormat = '%Y-%u';
        break;
      case 'month':
        dateFormat = '%Y-%m';
        break;
      default:
        dateFormat = '%Y-%m-%d';
    }

    let orderWhereClause = {
      created_at: {
        [db.Sequelize.Op.between]: [new Date(date_from), new Date(date_to)]
      }
    };

    let includeWhere = {};
    if (store_id) {
      includeWhere.store_id = store_id;
    }

    const salesData = await db.OrderItem.findAll({
      attributes: [
        [db.sequelize.fn('DATE_FORMAT', db.sequelize.col('Order.created_at'), dateFormat), 'period'],
        [db.sequelize.fn('SUM', db.sequelize.col('quantity')), 'total_quantity'],
        [db.sequelize.fn('COUNT', db.sequelize.col('OrderItem.order_item_id')), 'total_items'],
        [db.sequelize.literal('SUM(price_at_time * quantity)'), 'total_revenue'],
        [db.sequelize.fn('COUNT', db.sequelize.fn('DISTINCT', db.sequelize.col('order_id'))), 'total_orders']
      ],
      include: [
        {
          model: db.Order,
          as: 'Order',
          where: orderWhereClause,
          attributes: [],
          include: [
            {
              model: db.Store,
              as: 'Store',
              where: includeWhere,
              attributes: []
            }
          ]
        }
      ],
      group: [db.sequelize.fn('DATE_FORMAT', db.sequelize.col('Order.created_at'), dateFormat)],
      order: [[db.sequelize.fn('DATE_FORMAT', db.sequelize.col('Order.created_at'), dateFormat), 'ASC']]
    });

    const totalSummary = await db.OrderItem.findOne({
      attributes: [
        [db.sequelize.fn('SUM', db.sequelize.col('quantity')), 'total_quantity'],
        [db.sequelize.fn('COUNT', db.sequelize.col('OrderItem.order_item_id')), 'total_items'],
        [db.sequelize.literal('SUM(price_at_time * quantity)'), 'total_revenue'],
        [db.sequelize.fn('COUNT', db.sequelize.fn('DISTINCT', db.sequelize.col('order_id'))), 'total_orders']
      ],
      include: [
        {
          model: db.Order,
          as: 'Order',
          where: orderWhereClause,
          attributes: [],
          include: [
            {
              model: db.Store,
              as: 'Store',
              where: includeWhere,
              attributes: []
            }
          ]
        }
      ]
    });

    const formattedData = salesData.map(item => ({
      period: item.dataValues.period,
      total_quantity: parseInt(item.dataValues.total_quantity),
      total_items: parseInt(item.dataValues.total_items),
      total_revenue: parseFloat(item.dataValues.total_revenue || 0).toFixed(2),
      total_orders: parseInt(item.dataValues.total_orders)
    }));

    res.status(200).json({
      period: { from: date_from, to: date_to, group_by },
      summary: {
        total_quantity: parseInt(totalSummary.dataValues.total_quantity || 0),
        total_items: parseInt(totalSummary.dataValues.total_items || 0),
        total_revenue: parseFloat(totalSummary.dataValues.total_revenue || 0).toFixed(2),
        total_orders: parseInt(totalSummary.dataValues.total_orders || 0)
      },
      data: formattedData
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};