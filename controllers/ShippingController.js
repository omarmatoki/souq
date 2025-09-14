const db = require('../models');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// إنشاء المجلدات المطلوبة إذا لم تكن موجودة
const ensureDirectoryExists = async (dirPath) => {
  try {
    await fs.access(dirPath);
  } catch (error) {
    await fs.mkdir(dirPath, { recursive: true });
    console.log(`تم إنشاء المجلد: ${dirPath}`);
  }
};

// إنشاء مجلد uploads/identity عند بدء التشغيل
(async () => {
  await ensureDirectoryExists('uploads');
  await ensureDirectoryExists('uploads/identity');
})();

// إعداد تخزين الملفات باستخدام Multer لصور الهوية
const storage = multer.diskStorage({
  destination: async function (req, file, cb) {
    const uploadPath = 'uploads/identity/';
    try {
      await ensureDirectoryExists(uploadPath);
      cb(null, uploadPath);
    } catch (error) {
      console.error('خطأ في إنشاء مجلد الرفع:', error);
      cb(error);
    }
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'identity-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    return cb(new Error('فقط الملفات بصيغة JPEG, JPG, PNG, GIF, و WEBP مسموحة!'));
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { 
    fileSize: 5 * 1024 * 1024, // 5MB كحد أقصى لكل صورة
    files: 5 // حد أقصى 5 ملفات
  }
}).array('identity_images', 5);

// تابع مساعد لحذف ملف من النظام
const deleteFileFromSystem = async (filePath) => {
  try {
    if (filePath && await fs.access(filePath).then(() => true).catch(() => false)) {
      await fs.unlink(filePath);
      console.log(`تم حذف الملف: ${filePath}`);
    }
  } catch (error) {
    console.error(`خطأ في حذف الملف ${filePath}:`, error.message);
  }
};

exports.createShipping = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      console.error('Upload error:', err);
      return res.status(400).json({ 
        error: 'خطأ في رفع الملفات',
        details: err.message 
      });
    }

    const transaction = await db.sequelize.transaction();
    let uploadedFiles = [];
    
    try {
      const {
        customer_session_id,
        customer_name,
        customer_phone,
        customer_whatsapp,
        recipient_name,
        shipping_address,
        source_address,
        destination,
        shipping_method
      } = req.body;

      // التحقق من صحة البيانات المطلوبة
      const requiredFields = [
        { field: customer_session_id, name: 'customer_session_id' },
        { field: customer_name, name: 'customer_name' },
        { field: customer_phone, name: 'customer_phone' },
        { field: shipping_address, name: 'shipping_address' }
      ];

      for (const { field, name } of requiredFields) {
        if (!field || field.toString().trim() === '') {
          await transaction.rollback();
          return res.status(400).json({ 
            error: `الحقل ${name} مطلوب` 
          });
        }
      }

      // التحقق من صحة رقم الهاتف
      const phoneRegex = /^[0-9+\-\s()]+$/;
      if (!phoneRegex.test(customer_phone.trim())) {
        await transaction.rollback();
        return res.status(400).json({ 
          error: 'رقم الهاتف غير صحيح' 
        });
      }

      // التحقق من وجود السيشن في السلة
      const cart = await db.Cart.findOne({
        where: { session_id: customer_session_id },
        include: [{ model: db.CartItem }]
      });

      if (!cart || !cart.CartItems || cart.CartItems.length === 0) {
        await transaction.rollback();
        return res.status(400).json({ 
          error: 'السلة فارغة أو غير موجودة لهذا السيشن' 
        });
      }

      // *** التغيير الرئيسي: إزالة فحص الشحن المكرر ***
      // السماح بإنشاء معلومات شحن متعددة لنفس السيشن
      // لأن العميل قد يشتري عدة مرات بعناوين مختلفة
      
      // معالجة صور الهوية إذا تم رفعها
      let identityImages = [];
      if (req.files && req.files.length > 0) {
        uploadedFiles = req.files;
        
        identityImages = req.files.map((file, index) => ({
          path: `uploads/identity/${file.filename}`,
          originalName: file.originalname,
          type: index === 0 ? 'front' : index === 1 ? 'back' : 'additional',
          size: file.size,
          mimeType: file.mimetype,
          uploaded_at: new Date().toISOString()
        }));
      }

      // *** التغيير الثاني: إضافة purchase_id ***
      // إنشاء purchase_id فريد لهذه العملية
      const { v4: uuidv4 } = require('uuid');
      const purchaseId = uuidv4();

      // إنشاء معلومات الشحن مع purchase_id
      const shipping = await db.Shipping.create({
        purchase_id: purchaseId, // *** جديد ***
        customer_session_id: customer_session_id.toString().trim(),
        customer_name: customer_name.toString().trim(),
        customer_phone: customer_phone.toString().trim(),
        customer_whatsapp: customer_whatsapp ? customer_whatsapp.toString().trim() : null,
        recipient_name: recipient_name ? recipient_name.toString().trim() : customer_name.toString().trim(),
        shipping_address: shipping_address.toString().trim(),
        source_address: source_address ? source_address.toString().trim() : null,
        destination: destination ? destination.toString().trim() : null,
        shipping_method: shipping_method ? shipping_method.toString().trim() : 'standard',
        shipping_status: 'preparing',
        identity_images: identityImages.length > 0 ? identityImages : null
      }, { transaction });

      await transaction.commit();

      res.status(201).json({
        success: true,
        message: 'تم إنشاء معلومات الشحن بنجاح',
        data: {
          shipping_id: shipping.shipping_id,
          purchase_id: purchaseId, // *** جديد - مهم للخطوات التالية ***
          customer_session_id,
          ready_for_payment: true, // *** جديد - إشارة أن البيانات جاهزة للدفع ***
          identity_info: {
            images_uploaded: identityImages.length,
            has_front_image: identityImages.some(img => img.type === 'front'),
            has_back_image: identityImages.some(img => img.type === 'back'),
            total_images: identityImages.length
          },
          cart_items_count: cart.CartItems.length,
          next_step: 'يمكنك الآن الانتقال لصفحة الدفع' // *** تغيير الرسالة ***
        }
      });

    } catch (error) {
      await transaction.rollback();
      
      console.error('Shipping creation error:', {
        message: error.message,
        stack: error.stack,
        body: req.body,
        files: req.files ? req.files.map(f => ({ 
          filename: f.filename, 
          size: f.size, 
          mimetype: f.mimetype 
        })) : []
      });

      // حذف الملفات المرفوعة في حالة الخطأ
      if (uploadedFiles.length > 0) {
        for (const file of uploadedFiles) {
          try {
            await fs.unlink(file.path);
            console.log(`Deleted file: ${file.filename}`);
          } catch (deleteError) {
            console.warn(`Could not delete file ${file.filename}:`, deleteError.message);
          }
        }
      }
      
      // تحديد نوع الخطأ وإرسال استجابة مناسبة
      if (error.name === 'SequelizeValidationError') {
        return res.status(400).json({ 
          error: 'خطأ في صحة البيانات',
          details: error.errors.map(err => err.message)
        });
      }
      
      if (error.name === 'SequelizeForeignKeyConstraintError') {
        return res.status(400).json({ 
          error: 'خطأ في ربط البيانات - تأكد من صحة معرف الطلب'
        });
      }

      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).json({ 
          error: 'توجد بيانات مكررة'
        });
      }
      
      res.status(500).json({ 
        error: 'حدث خطأ في السيرفر',
        message: process.env.NODE_ENV === 'development' ? error.message : 'خطأ داخلي في السيرفر'
      });
    }
  });
};

// تحديث صور الهوية لشحنة معينة
exports.updateIdentityImages = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    try {
      const { id } = req.params;
      
      const shipping = await db.Shipping.findByPk(id, {
        include: [
          {
            model: db.Order,
            as: 'Order',
            include: [{ model: db.Store, as: 'Store' }]
          }
        ]
      });

      if (!shipping) {
        return res.status(404).json({ error: 'معلومات الشحن غير موجودة' });
      }

      // التحقق من ملكية المتجر (إذا كان مطلوب)
      // if (shipping.Order.Store.user_id !== req.user.user_id) {
      //   return res.status(403).json({ error: 'غير مصرح لك بتحديث صور الهوية لهذا الطلب' });
      // }

      // معالجة الصور الجديدة
      let newImages = [];
      if (req.files && req.files.length > 0) {
        newImages = req.files.map((file, index) => ({
          path: `uploads/identity/${file.filename}`, // تم إزالة الـ / من البداية
          originalName: file.originalname,
          type: req.body.image_types ? req.body.image_types[index] : 'additional',
          size: file.size,
          mimeType: file.mimetype,
          uploaded_at: new Date()
        }));
      }

      // دمج الصور الجديدة مع الموجودة
      const existingImages = shipping.identity_images || [];
      const updatedImages = [...existingImages, ...newImages];

      await shipping.update({
        identity_images: updatedImages.length > 0 ? updatedImages : null
      });

      res.status(200).json({
        message: 'تم تحديث صور الهوية بنجاح',
        shipping_id: shipping.shipping_id,
        identity_images_count: updatedImages.length,
        added_images: newImages.length
      });

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'حدث خطأ في تحديث صور الهوية' });
    }
  });
};

// تابع عرض طلبات الزبون
exports.getCustomerOrders = async (req, res) => {
  try {
    const { customer_session_id } = req.params;
    
    const orders = await db.Order.findAll({
      where: { customer_session_id },
      include: [
        {
          model: db.OrderItem,
          as: 'OrderItems',
          include: [{ model: db.Product, as: 'Product' }]
        },
        { 
          model: db.Shipping, 
          as: 'Shipping',
          attributes: [
            'shipping_id', 'customer_name', 'customer_phone', 'customer_whatsapp',
            'recipient_name', 'shipping_address', 'destination', 'shipping_method',
            'tracking_number', 'shipping_status', 'shipped_at', 'delivered_at',
            'identity_images'
          ]
        },
        { model: db.Store, as: 'Store' }
      ],
      order: [['created_at', 'DESC']]
    });

    // إضافة معلومات صور الهوية
    const formattedOrders = orders.map(order => {
      const orderData = order.toJSON();
      
      if (orderData.Shipping && orderData.Shipping.identity_images) {
        orderData.Shipping.identity_info = {
          has_images: true,
          images_count: orderData.Shipping.identity_images.length,
          has_front: orderData.Shipping.identity_images.some(img => img.type === 'front'),
          has_back: orderData.Shipping.identity_images.some(img => img.type === 'back')
        };
      } else if (orderData.Shipping) {
        orderData.Shipping.identity_info = {
          has_images: false,
          images_count: 0,
          has_front: false,
          has_back: false
        };
      }
      
      return orderData;
    });
    
    res.json(formattedOrders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على جميع معلومات الشحن
exports.getAllShipping = async (req, res) => {
  try {
    const { shipping_status, store_id, has_identity } = req.query;
    let includeWhere = {};
    
    if (store_id) {
      includeWhere.store_id = store_id;
    }

    let whereClause = {};
    if (shipping_status) {
      whereClause.shipping_status = shipping_status;
    }

    // فلترة حسب وجود صور الهوية
    if (has_identity === 'true') {
      whereClause.identity_images = { [db.Sequelize.Op.ne]: null };
    } else if (has_identity === 'false') {
      whereClause.identity_images = { [db.Sequelize.Op.is]: null };
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

    // تنسيق البيانات مع معلومات الهوية
    const formattedShippings = shippings.map(shipping => {
      const shippingData = shipping.toJSON();
      
      // تنسيق صور المنتجات
      if (shippingData.Order && shippingData.Order.OrderItems) {
        shippingData.Order.OrderItems = shippingData.Order.OrderItems.map(item => {
          if (item.Product && item.Product.images) {
            item.Product.images = JSON.parse(item.Product.images || '[]');
          }
          return item;
        });
      }

      // إضافة معلومات الهوية
      shippingData.identity_info = {
        has_images: !!shippingData.identity_images,
        images_count: shippingData.identity_images ? shippingData.identity_images.length : 0,
        has_front: shippingData.identity_images ? 
          shippingData.identity_images.some(img => img.type === 'front') : false,
        has_back: shippingData.identity_images ? 
          shippingData.identity_images.some(img => img.type === 'back') : false
      };

      return shippingData;
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
          as: 'Order',
          include: [
            {
              model: db.Store,
              as: 'Store',
              attributes: ['store_name', 'logo_image', 'store_address']
            },
            {
              model: db.OrderItem,
              as: 'OrderItems',
              include: [
                {
                  model: db.Product,
                  as: 'Product',
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

    const shippingData = shipping.toJSON();

    // تنسيق صور المنتجات
    if (shippingData.Order && shippingData.Order.OrderItems) {
      shippingData.Order.OrderItems = shippingData.Order.OrderItems.map(item => {
        if (item.Product && item.Product.images) {
          item.Product.images = JSON.parse(item.Product.images || '[]');
        }
        return item;
      });
    }

    // إضافة معلومات مفصلة عن صور الهوية
    if (shippingData.identity_images) {
      shippingData.identity_details = {
        total_images: shippingData.identity_images.length,
        front_image: shippingData.identity_images.find(img => img.type === 'front'),
        back_image: shippingData.identity_images.find(img => img.type === 'back'),
        additional_images: shippingData.identity_images.filter(img => img.type === 'additional'),
        upload_dates: shippingData.identity_images.map(img => img.uploaded_at)
      };
    }

    res.status(200).json(shippingData);
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
          as: 'Order',
          include: [{ model: db.Store, as: 'Store' }]
        }
      ]
    });

    if (!shipping) {
      return res.status(404).json({ error: 'معلومات الشحن غير موجودة' });
    }

    // التحقق من ملكية المتجر (معطل حالياً)
    // if (shipping.Order.Store.user_id !== req.user.user_id) {
    //   return res.status(403).json({ error: 'غير مصرح لك بتعديل معلومات الشحن لهذا الطلب' });
    // }

    const updatedData = { ...req.body };

    // إزالة identity_images من البيانات المحدثة إذا تم تمريرها
    // يجب استخدام endpoint منفصل لتحديث صور الهوية
    delete updatedData.identity_images;

    await shipping.update(updatedData);
    res.status(200).json({
      message: 'تم تحديث معلومات الشحن بنجاح',
      shipping
    });
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
          as: 'Order',
          include: [{ model: db.Store, as: 'Store' }]
        }
      ]
    });

    if (!shipping) {
      return res.status(404).json({ error: 'معلومات الشحن غير موجودة' });
    }

    // التحقق من ملكية المتجر (معطل حالياً)
    // if (shipping.Order.Store.user_id !== req.user.user_id) {
    //   return res.status(403).json({ error: 'غير مصرح لك بتعديل حالة الشحن لهذا الطلب' });
    // }

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
      await shipping.Order.update({ status: 'shipped' });
    } else if (shipping_status === 'delivered') {
      await shipping.Order.update({ status: 'delivered' });
    }

    res.status(200).json({ 
      message: 'تم تحديث حالة الشحن بنجاح', 
      shipping,
      identity_info: shipping.identity_images ? {
        has_images: true,
        images_count: shipping.identity_images.length
      } : { has_images: false, images_count: 0 }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// حذف صورة هوية معينة
exports.deleteIdentityImage = async (req, res) => {
  try {
    const { id } = req.params;
    const { image_path } = req.body;

    const shipping = await db.Shipping.findByPk(id);
    if (!shipping) {
      return res.status(404).json({ error: 'معلومات الشحن غير موجودة' });
    }

    if (!shipping.identity_images || shipping.identity_images.length === 0) {
      return res.status(400).json({ error: 'لا توجد صور هوية لحذفها' });
    }

    // البحث عن الصورة المراد حذفها
    const imageToDelete = shipping.identity_images.find(img => img.path === image_path);
    if (!imageToDelete) {
      return res.status(404).json({ error: 'الصورة المحددة غير موجودة' });
    }

    // حذف الصورة من المصفوفة
    const updatedImages = shipping.identity_images.filter(img => img.path !== image_path);

    // حذف الملف من النظام
    await deleteFileFromSystem(image_path);

    // تحديث قاعدة البيانات
    await shipping.update({
      identity_images: updatedImages.length > 0 ? updatedImages : null
    });

    res.status(200).json({
      message: 'تم حذف صورة الهوية بنجاح',
      deleted_image: imageToDelete,
      remaining_images: updatedImages.length
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في حذف صورة الهوية' });
  }
};

// حذف معلومات الشحن
exports.deleteShipping = async (req, res) => {
  try {
    const shipping = await db.Shipping.findByPk(req.params.id, {
      include: [
        {
          model: db.Order,
          as: 'Order',
          include: [{ model: db.Store, as: 'Store' }]
        }
      ]
    });

    if (!shipping) {
      return res.status(404).json({ error: 'معلومات الشحن غير موجودة' });
    }

    // التحقق من ملكية المتجر (معطل حالياً)
    // if (shipping.Order.Store.user_id !== req.user.user_id) {
    //   return res.status(403).json({ error: 'غير مصرح لك بحذف معلومات الشحن لهذا الطلب' });
    // }

    // يمكن حذف معلومات الشحن فقط إذا لم يتم شحن الطلب بعد
    if (['shipped', 'in_transit', 'delivered'].includes(shipping.shipping_status)) {
      return res.status(400).json({ error: 'لا يمكن حذف معلومات الشحن بعد الشحن' });
    }

    // حذف جميع صور الهوية من النظام
    if (shipping.identity_images && shipping.identity_images.length > 0) {
      for (const image of shipping.identity_images) {
        await deleteFileFromSystem(image.path);
      }
    }

    await shipping.destroy();
    res.status(200).json({ 
      message: 'تم حذف معلومات الشحن وجميع الملفات المرتبطة بها بنجاح' 
    });
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
          as: 'Order',
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
      ]
    });

    if (!shipping) {
      return res.status(404).json({ error: 'رقم التتبع غير صحيح' });
    }

    const shippingData = shipping.toJSON();

    // تنسيق صور المنتجات
    if (shippingData.Order && shippingData.Order.OrderItems) {
      shippingData.Order.OrderItems = shippingData.Order.OrderItems.map(item => {
        if (item.Product && item.Product.images) {
          item.Product.images = JSON.parse(item.Product.images || '[]');
        }
        return item;
      });
    }

    // إضافة معلومات الهوية (بدون عرض الصور للأمان)
    shippingData.identity_verified = !!shippingData.identity_images && shippingData.identity_images.length > 0;

    // إزالة مسارات الصور من الاستجابة للأمان
    delete shippingData.identity_images;

    res.status(200).json(shippingData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};

// الحصول على شحنات متجر معين
exports.getStoreShippings = async (req, res) => {
  try {
    const { store_id } = req.params;
    const { shipping_status, has_identity } = req.query;

    // التحقق من وجود المتجر
    const store = await db.Store.findByPk(store_id);
    if (!store) {
      return res.status(404).json({ error: 'المتجر غير موجود' });
    }

    // التحقق من ملكية المتجر (معطل حالياً)
    // if (store.user_id !== req.user.user_id) {
    //   return res.status(403).json({ error: 'غير مصرح لك بعرض شحنات هذا المتجر' });
    // }

    let whereClause = {};
    if (shipping_status) {
      whereClause.shipping_status = shipping_status;
    }

    // فلترة حسب وجود صور الهوية
    if (has_identity === 'true') {
      whereClause.identity_images = { [db.Sequelize.Op.ne]: null };
    } else if (has_identity === 'false') {
      whereClause.identity_images = { [db.Sequelize.Op.is]: null };
    }

    const shippings = await db.Shipping.findAll({
      where: whereClause,
      include: [
        {
          model: db.Order,
          as: 'Order',
          where: { store_id },
          include: [
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

    // تنسيق البيانات مع معلومات الهوية
    const formattedShippings = shippings.map(shipping => {
      const shippingData = shipping.toJSON();
      
      // تنسيق صور المنتجات
      if (shippingData.Order && shippingData.Order.OrderItems) {
        shippingData.Order.OrderItems = shippingData.Order.OrderItems.map(item => {
          if (item.Product && item.Product.images) {
            item.Product.images = JSON.parse(item.Product.images || '[]');
          }
          return item;
        });
      }

      // إضافة معلومات الهوية
      shippingData.identity_info = {
        has_images: !!shippingData.identity_images,
        images_count: shippingData.identity_images ? shippingData.identity_images.length : 0,
        has_front: shippingData.identity_images ? 
          shippingData.identity_images.some(img => img.type === 'front') : false,
        has_back: shippingData.identity_images ? 
          shippingData.identity_images.some(img => img.type === 'back') : false
      };

      return shippingData;
    });

    res.status(200).json(formattedShippings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
};