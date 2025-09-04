const db = require('../models');

// إضافة عنصر للسلة
exports.addCartItem = async (req, res) => {
  try {
    const { cart_id, product_id, quantity = 1 } = req.body;

    if (!cart_id || !product_id) {
      return res.status(400).json({ error: 'معرف السلة ومعرف المنتج مطلوبان' });
    }

    // التحقق من وجود السلة
    const cart = await db.Cart.findByPk(cart_id);
    if (!cart) {
      return res.status(404).json({ error: 'السلة غير موجودة' });
    }

    // التحقق من وجود المنتج
    const product = await db.Product.findByPk(product_id);
    if (!product) {
      return res.status(404).json({ error: 'المنتج غير موجود' });
    }

    // التحقق من توفر المخزون
    if (product.stock_quantity < quantity) {
      return res.status(400).json({ error: 'المخزون غير كافي' });
    }

    // التحقق من وجود المنتج في السلة مسبقاً
    let cartItem = await db.CartItem.findOne({
      where: {
        cart_id,
        product_id
      }
    });

    if (cartItem) {
      // تحديث الكمية
      const newQuantity = cartItem.quantity + quantity;
      if (product.stock_quantity < newQuantity) {
        return res.status(400).json({ error: 'المخزون غير كافي للكمية المطلوبة' });
      }
      await cartItem.update({ quantity: newQuantity });
    } else {
      // إنشاء عنصر جديد في السلة
      cartItem = await db.CartItem.create({
        cart_id,
        product_id,
        quantity
      });
    }

    // إرجاع العنصر مع تفاصيل المنتج
    const cartItemWithProduct = await db.CartItem.findByPk(cartItem.cart_item_id, {
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
      ]
    });

    // تنسيق صور المنتج
    if (cartItemWithProduct.Product && cartItemWithProduct.Product.images) {
      cartItemWithProduct.Product.images = JSON.parse(cartItemWithProduct.Product.images || '[]');
    }

    res.status(201).json(cartItemWithProduct);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على جميع عناصر السلة
exports.getAllCartItems = async (req, res) => {
  try {
    const { cart_id } = req.query;
    let whereClause = {};

    if (cart_id) {
      whereClause.cart_id = cart_id;
    }

    const cartItems = await db.CartItem.findAll({
      where: whereClause,
      include: [
        {
          model: db.Cart,
          as: 'Cart',
          attributes: ['session_id', 'created_at']
        },
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
      order: [['cart_item_id', 'DESC']]
    });

    // تنسيق صور المنتجات
    const formattedCartItems = cartItems.map(item => {
      if (item.Product && item.Product.images) {
        item.Product.images = JSON.parse(item.Product.images || '[]');
      }
      return item;
    });

    res.status(200).json(formattedCartItems);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على عنصر سلة بواسطة المعرف
exports.getCartItemById = async (req, res) => {
  try {
    const cartItem = await db.CartItem.findByPk(req.params.id, {
      include: [
        {
          model: db.Cart,
          as: 'Cart',
          attributes: ['session_id', 'created_at']
        },
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
      ]
    });

    if (!cartItem) {
      return res.status(404).json({ error: 'عنصر السلة غير موجود' });
    }

    // تنسيق صور المنتج
    if (cartItem.Product && cartItem.Product.images) {
      cartItem.Product.images = JSON.parse(cartItem.Product.images || '[]');
    }

    res.status(200).json(cartItem);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// تحديث كمية عنصر في السلة
exports.updateCartItem = async (req, res) => {
  try {
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ error: 'الكمية يجب أن تكون أكبر من صفر' });
    }

    const cartItem = await db.CartItem.findByPk(req.params.id, {
      include: [{ model: db.Product, as: 'Product' }]
    });

    if (!cartItem) {
      return res.status(404).json({ error: 'عنصر السلة غير موجود' });
    }

    // التحقق من توفر المخزون
    if (cartItem.Product.stock_quantity < quantity) {
      return res.status(400).json({ error: 'المخزون غير كافي' });
    }

    await cartItem.update({ quantity });

    // إرجاع العنصر المحدث مع تفاصيل المنتج
    const updatedCartItem = await db.CartItem.findByPk(req.params.id, {
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
      ]
    });

    // تنسيق صور المنتج
    if (updatedCartItem.Product && updatedCartItem.Product.images) {
      updatedCartItem.Product.images = JSON.parse(updatedCartItem.Product.images || '[]');
    }

    res.status(200).json(updatedCartItem);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// حذف عنصر من السلة
exports.deleteCartItem = async (req, res) => {
  try {
    const { ids } = req.body;

    // التحقق من وجود مصفوفة المعرفات
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ 
        error: 'يجب إرسال مصفوفة معرفات في body' 
      });
    }

    // حذف العناصر مباشرة
    const deletedCount = await db.CartItem.destroy({
      where: {
        cart_item_id: ids
      }
    });

    // إرجاع النتيجة
    if (deletedCount > 0) {
      return res.status(200).json({
        message: `تم حذف ${deletedCount} عنصر من السلة بنجاح`,
        deletedCount: deletedCount
      });
    } else {
      return res.status(404).json({
        error: 'لم يتم العثور على أي عناصر للحذف'
      });
    }

  } catch (error) {
    console.error('خطأ في حذف عناصر السلة:', error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// حذف جميع عناصر سلة معينة
exports.clearCartItems = async (req, res) => {
  try {
    const { cart_id } = req.params;

    // التحقق من وجود السلة
    const cart = await db.Cart.findByPk(cart_id);
    if (!cart) {
      return res.status(404).json({ error: 'السلة غير موجودة' });
    }

    const deletedCount = await db.CartItem.destroy({
      where: { cart_id }
    });

    res.status(200).json({ 
      message: 'تم مسح السلة بنجاح',
      deletedItems: deletedCount
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على إجمالي عناصر سلة معينة
exports.getCartItemsTotal = async (req, res) => {
  try {
    const { cart_id } = req.params;

    const cartItems = await db.CartItem.findAll({
      where: { cart_id },
      include: [
        {
          model: db.Product,
          as: 'Product',
          attributes: ['price']
        }
      ]
    });

    if (cartItems.length === 0) {
      return res.status(200).json({
        total: 0,
        itemsCount: 0,
        items: []
      });
    }

    let total = 0;
    let itemsCount = 0;

    const itemsSummary = cartItems.map(item => {
      const itemTotal = item.Product.price * item.quantity;
      total += itemTotal;
      itemsCount += item.quantity;

      return {
        cart_item_id: item.cart_item_id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.Product.price,
        total_price: itemTotal
      };
    });

    res.status(200).json({
      total: parseFloat(total.toFixed(2)),
      itemsCount,
      items: itemsSummary
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// نقل عناصر من سلة إلى أخرى
exports.moveCartItems = async (req, res) => {
  try {
    const { from_cart_id, to_cart_id } = req.body;

    if (!from_cart_id || !to_cart_id) {
      return res.status(400).json({ error: 'معرفات السلة المصدر والهدف مطلوبة' });
    }

    // التحقق من وجود السلتين
    const fromCart = await db.Cart.findByPk(from_cart_id);
    const toCart = await db.Cart.findByPk(to_cart_id);

    if (!fromCart || !toCart) {
      return res.status(404).json({ error: 'إحدى السلتين غير موجودة' });
    }

    // الحصول على عناصر السلة المصدر
    const cartItems = await db.CartItem.findAll({
      where: { cart_id: from_cart_id }
    });

    if (cartItems.length === 0) {
      return res.status(400).json({ error: 'السلة المصدر فارغة' });
    }

    const transaction = await db.sequelize.transaction();

    try {
      for (const item of cartItems) {
        // البحث عن المنتج في السلة الهدف
        const existingItem = await db.CartItem.findOne({
          where: {
            cart_id: to_cart_id,
            product_id: item.product_id
          },
          transaction
        });

        if (existingItem) {
          // تحديث الكمية
          await existingItem.update({
            quantity: existingItem.quantity + item.quantity
          }, { transaction });
        } else {
          // إنشاء عنصر جديد
          await db.CartItem.create({
            cart_id: to_cart_id,
            product_id: item.product_id,
            quantity: item.quantity
          }, { transaction });
        }

        // حذف العنصر من السلة المصدر
        await item.destroy({ transaction });
      }

      await transaction.commit();

      res.status(200).json({
        message: 'تم نقل العناصر بنجاح',
        movedItems: cartItems.length
      });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};