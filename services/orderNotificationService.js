const whatsappService = require('../config/whatsapp');
const db = require('../models');

// تابع لإرسال إشعار الطلب الجديد لصاحب المتجر
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
      productsDetails += `  السعر: ${item.price_at_time} $\n`;
      productsDetails += `  المجموع: ${(item.price_at_time * item.quantity).toFixed(2)} $\n\n`;
    }

    // ✅ إعداد العنوان بشكل آمن مع التحقق من جميع الخصائص المحتملة
    const getCustomerAddress = () => {
      // التحقق من الخصائص المختلفة المحتملة للعنوان
      const address = shipping.customer_address || 
                    shipping.address || 
                    shipping.shipping_address || 
                    shipping.delivery_address;
      
      if (!address) {
        return 'العنوان غير محدد';
      }
      
      // إذا كان العنوان عبارة عن كائن JSON
      if (typeof address === 'object') {
        const addressParts = [];
        if (address.street) addressParts.push(address.street);
        if (address.city) addressParts.push(address.city);
        if (address.district) addressParts.push(address.district);
        if (address.building) addressParts.push(`مبنى ${address.building}`);
        if (address.apartment) addressParts.push(`شقة ${address.apartment}`);
        
        return addressParts.length > 0 ? addressParts.join(', ') : 'العنوان غير محدد';
      }
      
      return address;
    };

    // ✅ تحضير الرسالة بدون معرف الطلب ومعرف الشراء
    const message = `🛍️ *طلب جديد على متجرك!*

🏪 المتجر: *${store.store_name}*

👤 *بيانات العميل:*
الاسم: ${shipping.customer_name || 'غير محدد'}
الهاتف: ${shipping.customer_phone || 'غير محدد'}
العنوان: ${getCustomerAddress()}
${shipping.customer_notes ? `ملاحظات: ${shipping.customer_notes}` : ''}

📦 *تفاصيل الطلب:*
${productsDetails}

💰 *الملخص المالي:*
إجمالي المنتجات: ${totalQuantity} قطعة
المبلغ الإجمالي: *${order.total_price} $*

📋 *حالة الطلب:* ${getStatusInArabic(order.status)}

⏰ تاريخ الطلب: ${new Date(order.created_at).toLocaleString('en-US', { 
  year: 'numeric', 
  month: '2-digit', 
  day: '2-digit', 
  hour: '2-digit', 
  minute: '2-digit',
  hour12: true
})}

---
يرجى مراجعة لوحة التحكم لإدارة الطلب 📱`;

    // إرسال الرسالة
    const result = await whatsappService.sendMessage(store.User.whatsapp_number, message);
    
    console.log(`تم إرسال إشعار طلب جديد لصاحب المتجر ${store.store_name}`);
    
    return {
      success: true,
      storeName: store.store_name,
      merchantName: store.User.username,
      phoneNumber: store.User.whatsapp_number,
      purchaseId: order.purchase_id // ✅ تغيير من orderId إلى purchaseId
    };

  } catch (error) {
    console.error('خطأ في إرسال إشعار الطلب:', error);
    return {
      success: false,
      error: error.message,
      purchaseId: order.purchase_id // ✅ تغيير من orderId إلى purchaseId
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