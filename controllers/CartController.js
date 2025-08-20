const db = require('../models');

// إنشاء سلة جديدة أو الحصول على السلة الموجودة
exports.getOrCreateCart = async (req, res) => {
  try {
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: 'معرف الجلسة مطلوب' });
    }

    let cart = await db.Cart.findOne({
      where: { session_id },
      include: [
        {
          model: db.CartItem,
          as: 'CartItems',
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
        }
      ]
    });

    if (!cart) {
      cart = await db.Cart.create({ session_id });
      cart.CartItems = [];
    }

    // تنسيق البيانات
    if (cart.CartItems) {
      cart.CartItems = cart.CartItems.map(item => {
        if (item.Product && item.Product.images) {
          item.Product.images = JSON.parse(item.Product.images || '[]');
        }
        return item;
      });
    }

    res.status(200).json(cart);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// إضافة منتج للسلة
exports.addToCart = async (req, res) => {
  try {
    const { session_id, product_id, quantity = 1 } = req.body;

    if (!session_id || !product_id) {
      return res.status(400).json({ error: 'معرف الجلسة ومعرف المنتج مطلوبان' });
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

    // الحصول على السلة أو إنشاؤها
    let cart = await db.Cart.findOne({ where: { session_id } });
    if (!cart) {
      cart = await db.Cart.create({ session_id });
    }

    // التحقق من وجود المنتج في السلة
    let cartItem = await db.CartItem.findOne({
      where: {
        cart_id: cart.cart_id,
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
      // إضافة منتج جديد للسلة
      cartItem = await db.CartItem.create({
        cart_id: cart.cart_id,
        product_id,
        quantity
      });
    }

    // إرجاع عنصر السلة مع تفاصيل المنتج
    const updatedCartItem = await db.CartItem.findByPk(cartItem.cart_item_id, {
      include: [
        {
          model: db.Product,
          as: 'product',
          include: [
            {
              model: db.Store,
              as: 'store',
              attributes: ['store_name', 'logo_image']
            }
          ]
        }
      ]
    });

    if (updatedCartItem.product && updatedCartItem.product.images) {
      updatedCartItem.product.images = JSON.parse(updatedCartItem.product.images || '[]');
    }

    res.status(201).json(updatedCartItem);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// تحديث كمية منتج في السلة
exports.updateCartItem = async (req, res) => {
  try {
    const { quantity } = req.body;
    const { id } = req.params;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ error: 'الكمية يجب أن تكون أكبر من صفر' });
    }

    const cartItem = await db.CartItem.findByPk(id, {
      include: [{ model: db.Product, as: 'product' }]
    });

    if (!cartItem) {
      return res.status(404).json({ error: 'عنصر السلة غير موجود' });
    }

    // التحقق من توفر المخزون
    if (cartItem.product.stock_quantity < quantity) {
      return res.status(400).json({ error: 'المخزون غير كافي' });
    }

    await cartItem.update({ quantity });

    // إرجاع العنصر المحدث مع تفاصيل المنتج
    const updatedCartItem = await db.CartItem.findByPk(id, {
      include: [
        {
          model: db.Product,
          as: 'product',
          include: [
            {
              model: db.Store,
              as: 'store',
              attributes: ['store_name', 'logo_image']
            }
          ]
        }
      ]
    });

    if (updatedCartItem.product && updatedCartItem.product.images) {
      updatedCartItem.product.images = JSON.parse(updatedCartItem.product.images || '[]');
    }

    res.status(200).json(updatedCartItem);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// حذف منتج من السلة
exports.removeFromCart = async (req, res) => {
  try {
    const { id } = req.params;

    const cartItem = await db.CartItem.findByPk(id);
    if (!cartItem) {
      return res.status(404).json({ error: 'عنصر السلة غير موجود' });
    }

    await cartItem.destroy();
    res.status(200).json({ message: 'تم حذف المنتج من السلة بنجاح' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// مسح السلة بالكامل
exports.clearCart = async (req, res) => {
  try {
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: 'معرف الجلسة مطلوب' });
    }

    const cart = await db.Cart.findOne({ where: { session_id } });
    if (!cart) {
      return res.status(404).json({ error: 'السلة غير موجودة' });
    }

    await db.CartItem.destroy({
      where: { cart_id: cart.cart_id }
    });

    res.status(200).json({ message: 'تم مسح السلة بنجاح' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على إجمالي السلة
exports.getCartTotal = async (req, res) => {
  try {
    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).json({ error: 'معرف الجلسة مطلوب' });
    }

    const cart = await db.Cart.findOne({
      where: { session_id },
      include: [
        {
          model: db.CartItem,
          as: 'items',
          include: [{ model: db.Product, as: 'product' }]
        }
      ]
    });

    if (!cart) {
      return res.status(200).json({ total: 0, itemsCount: 0 });
    }

    let total = 0;
    let itemsCount = 0;

    cart.items.forEach(item => {
      total += item.product.price * item.quantity;
      itemsCount += item.quantity;
    });

    res.status(200).json({ total, itemsCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// تجميع عناصر السلة حسب المتجر
exports.getCartByStore = async (req, res) => {
  try {
    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).json({ error: 'معرف الجلسة مطلوب' });
    }

    const cart = await db.Cart.findOne({
      where: { session_id },
      include: [
        {
          model: db.CartItem,
          as: 'items',
          include: [
            {
              model: db.Product,
              as: 'product',
              include: [
                {
                  model: db.Store,
                  as: 'store'
                }
              ]
            }
          ]
        }
      ]
    });

    if (!cart) {
      return res.status(200).json([]);
    }

    // تجميع العناصر حسب المتجر
    const storeGroups = {};

    cart.items.forEach(item => {
      const storeId = item.product.store.store_id;
      
      if (!storeGroups[storeId]) {
        storeGroups[storeId] = {
          store: item.product.store,
          items: [],
          total: 0
        };
      }

      // تنسيق صور المنتج
      if (item.product.images) {
        item.product.images = JSON.parse(item.product.images || '[]');
      }

      storeGroups[storeId].items.push(item);
      storeGroups[storeId].total += item.product.price * item.quantity;
    });

    const result = Object.values(storeGroups);
    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};