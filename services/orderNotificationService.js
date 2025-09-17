const whatsappService = require('../config/whatsapp');
const db = require('../models');

// تابع لإرسال إشعار الطلب الجديد لصاحب المتجر
const sendOrderNotificationToMerchant = async (order, orderItems, shipping) => {
  try {
    // جلب بيانات المتجر وصاحبه
    const store = await db.Store.findByPk(order.store_id, {
      include: [{
        model: db.User,
        attributes: ['username', 'whatsapp_number']
      }]
    });

    if (!store || !store.User || !store.User.whatsapp_number) {
      console.log(`لا يوجد رقم واتساب لصاحب المتجر ${store?.store_name || 'غير معروف'}`);
      return { success: false, reason: 'no_whatsapp_number' };
    }

    // تحضير تفاصيل المنتجات
    let productsDetails = '';
    let totalQuantity = 0;
    
    for (const item of orderItems) {
      const product = item.Product;
      totalQuantity += item.quantity;
      
      productsDetails += `• ${product.name}\n`;
      productsDetails += `  الكمية: ${item.quantity}\n`;
      productsDetails += `  السعر: ${item.price_at_time} ريال\n`;
      productsDetails += `  المجموع: ${(item.price_at_time * item.quantity).toFixed(2)} ريال\n\n`;
    }

    // تحضير الرسالة
    const message = `🛍️ *طلب جديد على متجرك!*

📅 رقم الطلب: *${order.order_id}*
🏪 المتجر: *${store.store_name}*

👤 *بيانات العميل:*
الاسم: ${shipping.customer_name}
الهاتف: ${shipping.customer_phone}
العنوان: ${shipping.customer_address}
${shipping.customer_notes ? `ملاحظات: ${shipping.customer_notes}` : ''}

📦 *تفاصيل الطلب:*
${productsDetails}

💰 *الملخص المالي:*
إجمالي المنتجات: ${totalQuantity} قطعة
المبلغ الإجمالي: *${order.total_price} ريال*

📋 *حالة الطلب:* ${getStatusInArabic(order.status)}
🆔 معرف الشراء: ${order.purchase_id}

⏰ تاريخ الطلب: ${new Date(order.created_at).toLocaleString('ar-SA')}

---
يرجى مراجعة لوحة التحكم لإدارة الطلب 📱`;

    // إرسال الرسالة
    const result = await whatsappService.sendMessage(store.User.whatsapp_number, message);
    
    console.log(`تم إرسال إشعار الطلب ${order.order_id} لصاحب المتجر ${store.store_name}`);
    
    return {
      success: true,
      storeName: store.store_name,
      merchantName: store.User.username,
      phoneNumber: store.User.whatsapp_number,
      orderId: order.order_id
    };

  } catch (error) {
    console.error('خطأ في إرسال إشعار الطلب:', error);
    return {
      success: false,
      error: error.message,
      orderId: order.order_id
    };
  }
};

// تابع مساعد لترجمة حالة الطلب
const getStatusInArabic = (status) => {
  const statusMap = {
    'pending': 'معلق',
    'confirmed': 'مؤكد',
    'processing': 'قيد التحضير',
    'shipped': 'تم الشحن',
    'delivered': 'تم التسليم',
    'completed': 'مكتمل',
    'cancelled': 'ملغي',
    'refunded': 'مسترد'
  };
  return statusMap[status] || status;
};

module.exports = {
  sendOrderNotificationToMerchant,
  getStatusInArabic
};