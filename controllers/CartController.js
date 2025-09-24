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

// إضافة منتج للسلة مع إنشاء السلة تلقائياً
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

    // حساب السعر النهائي (مع الخصم إن وُجد)
    const finalPrice = product.getDiscountedPrice();

    // الحصول على السلة أو إنشاؤها تلقائياً
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
      await cartItem.update({ 
        quantity: newQuantity,
        unit_price: finalPrice // تحديث السعر في حالة تغير الخصم
      });
    } else {
      // إضافة منتج جديد للسلة
      cartItem = await db.CartItem.create({
        cart_id: cart.cart_id,
        product_id,
        quantity,
        unit_price: finalPrice // حفظ السعر بعد الخصم
      });
    }

    // الحصول على السلة المحدثة مع جميع العناصر
    const updatedCart = await db.Cart.findOne({
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

    // تنسيق البيانات
    if (updatedCart.CartItems) {
      updatedCart.CartItems = updatedCart.CartItems.map(item => {
        if (item.Product && item.Product.images) {
          item.Product.images = JSON.parse(item.Product.images || '[]');
        }
        // إضافة معلومات الخصم للاستجابة
        if (item.Product) {
          item.Product.dataValues.original_price = item.Product.price;
          item.Product.dataValues.discounted_price = item.Product.getDiscountedPrice();
          item.Product.dataValues.discount_amount = item.Product.getDiscountAmount();
          item.Product.dataValues.has_discount = item.Product.hasDiscount();
          item.Product.dataValues.discount_percentage = item.Product.discount_percentage;
        }
        return item;
      });
    }

    res.status(201).json({
      message: 'تم إضافة المنتج للسلة بنجاح',
      cart: updatedCart,
      product_info: {
        original_price: product.price,
        final_price: finalPrice,
        discount_percentage: product.discount_percentage,
        discount_amount: product.getDiscountAmount(),
        has_discount: product.hasDiscount()
      }
    });
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

    // هنا: غيرنا alias ليتوافق مع العلاقة الافتراضية (Product)
    const cartItem = await db.CartItem.findByPk(id, {
      include: [{ model: db.Product }] // يمكن حذف as لأنه غير معرف في العلاقة
    });

    if (!cartItem) {
      return res.status(404).json({ error: 'عنصر السلة غير موجود' });
    }

    // تحقق من توفر المخزون
    if (cartItem.Product.stock_quantity < quantity) {
      return res.status(400).json({ error: 'المخزون غير كافي' });
    }

    await cartItem.update({ quantity });

    // إرجاع العنصر المحدث مع تفاصيل المنتج والمتجر
    const updatedCartItem = await db.CartItem.findByPk(id, {
      include: [
        {
          model: db.Product,
          include: [
            {
              model: db.Store, // استخدم نفس alias الافتراضي (Store)
              attributes: ['store_name', 'logo_image']
            }
          ]
        }
      ]
    });

    // تحديث الصور
    if (updatedCartItem.Product && updatedCartItem.Product.images) {
      updatedCartItem.Product.images = JSON.parse(updatedCartItem.Product.images || '[]');
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
          as: 'CartItems', // ✅ تصحيح الـ alias
          include: [{ 
            model: db.Product, 
            as: 'Product' // ✅ تصحيح الـ alias
          }]
        }
      ]
    });

    if (!cart) {
      return res.status(200).json({ total: 0, itemsCount: 0 });
    }

    let total = 0;
    let itemsCount = 0;

    // تصحيح استخدام الـ alias في الكود
    cart.CartItems.forEach(item => {
      total += item.Product.price * item.quantity;
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
