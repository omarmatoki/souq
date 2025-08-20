const db = require('./models');
const bcrypt = require('bcrypt');

async function seedDatabase() {
  try {
    // التحقق من الاتصال بقاعدة البيانات
    await db.sequelize.authenticate();
    console.log('✅ الاتصال بقاعدة البيانات ناجح');

    // مسح البيانات السابقة وإعادة إنشاء الجداول
    await db.sequelize.sync({ force: true });
    console.log('🔄 تم إعادة إنشاء جميع الجداول');

    // 1. إنشاء المستخدمين (Users)
    console.log('📝 إنشاء المستخدمين...');
    const users = await db.User.bulkCreate([
      {
        username: 'ahmed_store',
        password_hash: await bcrypt.hash('password123', 10),
        whatsapp_number: '+966501234567',
        id_image: 'ahmed_id.jpg',
        role: 'merchant'
      },
      {
        username: 'fatima_shop',
        password_hash: await bcrypt.hash('password123', 10),
        whatsapp_number: '+966502345678',
        id_image: 'fatima_id.jpg',
        role: 'merchant'
      },
      {
        username: 'mohammed_electronics',
        password_hash: await bcrypt.hash('password123', 10),
        whatsapp_number: '+966503456789',
        id_image: 'mohammed_id.jpg',
        role: 'merchant'
      },
      {
        username: 'sara_fashion',
        password_hash: await bcrypt.hash('password123', 10),
        whatsapp_number: '+966504567890',
        id_image: 'sara_id.jpg',
        role: 'merchant'
      },
      {
        username: 'omar_books',
        password_hash: await bcrypt.hash('password123', 10),
        whatsapp_number: '+966505678901',
        id_image: 'omar_id.jpg',
        role: 'merchant'
      },
      {
        username: 'admin',
        password_hash: await bcrypt.hash('admin123', 10),
        whatsapp_number: '+966500000000',
        id_image: 'admin_id.jpg',
        role: 'admin'
      }
    ]);
    console.log(`✅ تم إنشاء ${users.length} مستخدم`);

    // 2. إنشاء المتاجر (Stores)
    console.log('🏪 إنشاء المتاجر...');
    const stores = await db.Store.bulkCreate([
      {
        user_id: users[0].user_id,
        store_name: 'متجر أحمد للملابس',
        store_address: 'الرياض، حي النخيل، شارع الملك فهد',
        description: 'متجر متخصص في الملابس الرجالية والنسائية بأحدث الموديلات وأفضل الأسعار',
        images: JSON.stringify(['store1_1.jpg', 'store1_2.jpg', 'store1_3.jpg']),
        logo_image: 'logo_ahmed.png'
      },
      {
        user_id: users[1].user_id,
        store_name: 'متجر فاطمة للعطور',
        store_address: 'جدة، حي الزهراء، شارع التحلية',
        description: 'متجر رائد في عالم العطور الأصلية والمكياج التجميلي للسيدات',
        images: JSON.stringify(['store2_1.jpg', 'store2_2.jpg']),
        logo_image: 'logo_fatima.png'
      },
      {
        user_id: users[2].user_id,
        store_name: 'متجر محمد للإلكترونيات',
        store_address: 'الدمام، حي الفيصلية، شارع الأمير محمد بن فهد',
        description: 'أحدث الأجهزة الإلكترونية والهواتف الذكية بضمان شامل وخدمة ما بعد البيع',
        images: JSON.stringify(['store3_1.jpg', 'store3_2.jpg', 'store3_3.jpg', 'store3_4.jpg']),
        logo_image: 'logo_mohammed.png'
      },
      {
        user_id: users[3].user_id,
        store_name: 'بوتيك سارة للأزياء',
        store_address: 'الخبر، حي اليرموك، شارع الملك خالد',
        description: 'أزياء عصرية للسيدات مع أحدث صيحات الموضة العالمية',
        images: JSON.stringify(['store4_1.jpg', 'store4_2.jpg']),
        logo_image: 'logo_sara.png'
      },
      {
        user_id: users[4].user_id,
        store_name: 'مكتبة عمر الثقافية',
        store_address: 'المدينة المنورة، حي العوالي، شارع قباء',
        description: 'مكتبة شاملة للكتب والقرطاسية والأدوات المكتبية مع قسم خاص للكتب الدينية',
        images: JSON.stringify(['store5_1.jpg', 'store5_2.jpg', 'store5_3.jpg']),
        logo_image: 'logo_omar.png'
      }
    ]);
    console.log(`✅ تم إنشاء ${stores.length} متجر`);

    // 3. إنشاء المنتجات (Products) - 10 منتجات لكل متجر
    console.log('📦 إنشاء المنتجات...');
    const products = [];

    // منتجات متجر أحمد للملابس
    const ahmedProducts = [
      { name: 'قميص رجالي كلاسيكي', description: 'قميص رجالي أنيق مناسب للعمل والمناسبات الرسمية', price: 120.00, stock_quantity: 50 },
      { name: 'بنطال جينز رجالي', description: 'جينز عالي الجودة بقصة مريحة وأنيقة', price: 180.00, stock_quantity: 30 },
      { name: 'فستان سهرة نسائي', description: 'فستان أنيق للسهرات والمناسبات الخاصة', price: 350.00, stock_quantity: 20 },
      { name: 'بلوزة نسائية كاجوال', description: 'بلوزة مريحة للاستخدام اليومي بألوان متنوعة', price: 85.00, stock_quantity: 45 },
      { name: 'جاكيت شتوي رجالي', description: 'جاكيت دافئ وأنيق لفصل الشتاء', price: 280.00, stock_quantity: 25 },
      { name: 'تنورة نسائية', description: 'تنورة عصرية بتصميم جذاب ومريح', price: 95.00, stock_quantity: 35 },
      { name: 'بدلة رجالية كاملة', description: 'بدلة رسمية كاملة للمناسبات الهامة', price: 650.00, stock_quantity: 15 },
      { name: 'فستان يومي نسائي', description: 'فستان مريح للاستخدام اليومي بألوان زاهية', price: 140.00, stock_quantity: 40 },
      { name: 'بولو رجالي رياضي', description: 'قميص بولو مناسب للأنشطة الرياضية والكاجوال', price: 75.00, stock_quantity: 60 },
      { name: 'معطف نسائي شتوي', description: 'معطف أنيق ودافئ للسيدات في الشتاء', price: 420.00, stock_quantity: 18 }
    ];

    for (let product of ahmedProducts) {
      products.push({
        store_id: stores[0].store_id,
        ...product,
        images: JSON.stringify([`${product.name.replace(/\s/g, '_')}_1.jpg`, `${product.name.replace(/\s/g, '_')}_2.jpg`])
      });
    }

    // منتجات متجر فاطمة للعطور
    const fatimaProducts = [
      { name: 'عطر الورد الدمشقي', description: 'عطر نسائي فاخر برائحة الورد الطبيعي', price: 250.00, stock_quantity: 30 },
      { name: 'عود كمبودي أصلي', description: 'عود عالي الجودة من كمبوديا برائحة مميزة', price: 450.00, stock_quantity: 20 },
      { name: 'مجموعة أحمر شفاه', description: 'مجموعة من أحمر الشفاه بألوان متنوعة', price: 180.00, stock_quantity: 40 },
      { name: 'كريم مرطب للوجه', description: 'كريم طبيعي مرطب ومغذي للبشرة', price: 95.00, stock_quantity: 50 },
      { name: 'عطر العنبر الملكي', description: 'عطر رجالي فاخر برائحة العنبر الأصلي', price: 320.00, stock_quantity: 25 },
      { name: 'ماسكارا مقاومة للماء', description: 'ماسكارا عالية الجودة تدوم طوال اليوم', price: 65.00, stock_quantity: 60 },
      { name: 'بخاخ الجسم المنعش', description: 'بخاخ منعش للجسم برائحة الياسمين', price: 85.00, stock_quantity: 45 },
      { name: 'كريم الأساس الطبيعي', description: 'كريم أساس بتركيبة طبيعية لجميع أنواع البشرة', price: 120.00, stock_quantity: 35 },
      { name: 'عطر الصندل الهندي', description: 'عطر راقي برائحة الصندل الهندي الأصلي', price: 380.00, stock_quantity: 22 },
      { name: 'مجموعة العناية بالبشرة', description: 'مجموعة كاملة للعناية بالبشرة والترطيب', price: 290.00, stock_quantity: 28 }
    ];

    for (let product of fatimaProducts) {
      products.push({
        store_id: stores[1].store_id,
        ...product,
        images: JSON.stringify([`${product.name.replace(/\s/g, '_')}_1.jpg`, `${product.name.replace(/\s/g, '_')}_2.jpg`])
      });
    }

    // منتجات متجر محمد للإلكترونيات
    const mohammedProducts = [
      { name: 'هاتف ذكي سامسونج جالاكسي', description: 'أحدث هواتف سامسونج بمواصفات عالية وكاميرا متطورة', price: 2500.00, stock_quantity: 15 },
      { name: 'لابتوب ديل للألعاب', description: 'لابتوب قوي مخصص للألعاب والتطبيقات الثقيلة', price: 4200.00, stock_quantity: 8 },
      { name: 'سماعات بلوتوث لاسلكية', description: 'سماعات عالية الجودة مع تقنية إلغاء الضوضاء', price: 350.00, stock_quantity: 40 },
      { name: 'شاشة LED 55 بوصة', description: 'شاشة تلفزيون ذكية بدقة 4K وألوان زاهية', price: 1800.00, stock_quantity: 12 },
      { name: 'ساعة ذكية آبل واتش', description: 'ساعة ذكية متقدمة لمراقبة الصحة والرياضة', price: 1200.00, stock_quantity: 20 },
      { name: 'كاميرا رقمية كانون', description: 'كاميرا احترافية للتصوير الفوتوغرافي والفيديو', price: 3200.00, stock_quantity: 10 },
      { name: 'بلاي ستيشن 5', description: 'جهاز ألعاب سوني الأحدث بأداء استثنائي', price: 2800.00, stock_quantity: 6 },
      { name: 'راوتر واي فاي متقدم', description: 'راوتر عالي السرعة لإنترنت منزلي مستقر', price: 280.00, stock_quantity: 30 },
      { name: 'قرص تخزين خارجي', description: 'قرص تخزين محمول بسعة 2 تيرا بايت', price: 420.00, stock_quantity: 25 },
      { name: 'شاحن لاسلكي سريع', description: 'شاحن لاسلكي متوافق مع جميع الهواتف الذكية', price: 150.00, stock_quantity: 50 }
    ];

    for (let product of mohammedProducts) {
      products.push({
        store_id: stores[2].store_id,
        ...product,
        images: JSON.stringify([`${product.name.replace(/\s/g, '_')}_1.jpg`, `${product.name.replace(/\s/g, '_')}_2.jpg`, `${product.name.replace(/\s/g, '_')}_3.jpg`])
      });
    }

    // منتجات بوتيك سارة للأزياء
    const saraProducts = [
      { name: 'حقيبة يد جلدية فاخرة', description: 'حقيبة يد أنيقة من الجلد الطبيعي بتصميم عصري', price: 380.00, stock_quantity: 25 },
      { name: 'حذاء كعب عالي', description: 'حذاء نسائي أنيق بكعب عالي للمناسبات الخاصة', price: 220.00, stock_quantity: 30 },
      { name: 'وشاح حريري مطبوع', description: 'وشاح حريري فاخر بنقوش جميلة ومتنوعة', price: 95.00, stock_quantity: 45 },
      { name: 'فستان كوكتيل قصير', description: 'فستان أنيق للحفلات والمناسبات الاجتماعية', price: 450.00, stock_quantity: 18 },
      { name: 'سوار ذهبي مرصع', description: 'سوار ذهبي مرصع بالأحجار الكريمة', price: 850.00, stock_quantity: 12 },
      { name: 'نظارة شمسية عصرية', description: 'نظارة شمسية بإطار عصري وعدسات مقاومة للأشعة', price: 180.00, stock_quantity: 35 },
      { name: 'بلوزة حريرية فاخرة', description: 'بلوزة من الحرير الطبيعي بتصميم راقي', price: 280.00, stock_quantity: 22 },
      { name: 'حزام جلدي مزخرف', description: 'حزام جلدي أنيق مع إبزيم معدني مزخرف', price: 120.00, stock_quantity: 40 },
      { name: 'قلادة لؤلؤية', description: 'قلادة أنيقة من اللؤلؤ الطبيعي للمناسبات الخاصة', price: 650.00, stock_quantity: 15 },
      { name: 'شال صوفي منقوش', description: 'شال دافئ من الصوف الطبيعي بنقوش تقليدية', price: 160.00, stock_quantity: 28 }
    ];

    for (let product of saraProducts) {
      products.push({
        store_id: stores[3].store_id,
        ...product,
        images: JSON.stringify([`${product.name.replace(/\s/g, '_')}_1.jpg`, `${product.name.replace(/\s/g, '_')}_2.jpg`])
      });
    }

    // منتجات مكتبة عمر الثقافية
    const omarProducts = [
      { name: 'موسوعة التاريخ الإسلامي', description: 'موسوعة شاملة تضم تاريخ الحضارة الإسلامية عبر العصور', price: 180.00, stock_quantity: 25 },
      { name: 'مجموعة أقلام فاخرة', description: 'مجموعة من الأقلام الفاخرة للكتابة والخط العربي', price: 95.00, stock_quantity: 40 },
      { name: 'دفتر ملاحظات جلدي', description: 'دفتر ملاحظات بغلاف جلدي فاخر وأوراق عالية الجودة', price: 65.00, stock_quantity: 60 },
      { name: 'كتاب فن الطبخ العربي', description: 'كتاب شامل لأشهى الأطباق والحلويات العربية التراثية', price: 85.00, stock_quantity: 35 },
      { name: 'آلة حاسبة علمية', description: 'آلة حاسبة متقدمة للطلاب والمهندسين', price: 120.00, stock_quantity: 30 },
      { name: 'أطلس العالم المصور', description: 'أطلس جغرافي شامل بخرائط ملونة وتفصيلية', price: 150.00, stock_quantity: 20 },
      { name: 'مجموعة ألوان للرسم', description: 'مجموعة كاملة من ألوان الرسم والفرش للفنانين', price: 220.00, stock_quantity: 25 },
      { name: 'قاموس عربي-إنجليزي', description: 'قاموس شامل للترجمة بين العربية والإنجليزية', price: 95.00, stock_quantity: 45 },
      { name: 'كتاب الأدب العربي الحديث', description: 'مجموعة من أعمال كبار الأدباء العرب المعاصرين', price: 110.00, stock_quantity: 30 },
      { name: 'لوح كتابة ذكي', description: 'لوح إلكتروني للكتابة والرسم بتقنية حديثة', price: 350.00, stock_quantity: 15 }
    ];

    for (let product of omarProducts) {
      products.push({
        store_id: stores[4].store_id,
        ...product,
        images: JSON.stringify([`${product.name.replace(/\s/g, '_')}_1.jpg`])
      });
    }

    const createdProducts = await db.Product.bulkCreate(products);
    console.log(`✅ تم إنشاء ${createdProducts.length} منتج`);

    // 4. إنشاء المراجعات (Reviews)
    console.log('⭐ إنشاء المراجعات...');
    const reviews = [];
    const reviewerNames = ['علي محمد', 'نورا أحمد', 'خالد العتيبي', 'مريم السالم', 'عبدالله الغامدي', 'هند القحطاني', 'سعد الحربي', 'فاطمة النجار', 'يوسف الشهراني', 'ليلى العبدالله'];
    const comments = [
      'منتج ممتاز وجودة عالية، أنصح بالشراء',
      'سعر مناسب ومنتج جيد جداً',
      'تجربة رائعة والخدمة ممتازة',
      'المنتج كما هو موصوف تماماً',
      'جودة رائعة وتسليم سريع',
      'منتج مفيد وعملي جداً',
      'خدمة عملاء ممتازة ومنتج رائع',
      'راضي جداً عن الشراء',
      'سأشتري مرة أخرى بالتأكيد',
      'منتج يستحق السعر المدفوع'
    ];

    // إنشاء 3-5 مراجعات لكل منتج
    for (let product of createdProducts) {
      const numReviews = Math.floor(Math.random() * 3) + 3; // 3-5 مراجعات
      for (let i = 0; i < numReviews; i++) {
        reviews.push({
          product_id: product.product_id,
          reviewer_name: reviewerNames[Math.floor(Math.random() * reviewerNames.length)],
          reviewer_phone: `+96650${Math.floor(Math.random() * 9000000) + 1000000}`,
          rating: Math.floor(Math.random() * 2) + 4, // تقييم 4-5 نجوم
          comment: comments[Math.floor(Math.random() * comments.length)],
          is_verified: true
        });
      }
    }

    await db.Review.bulkCreate(reviews);
    console.log(`✅ تم إنشاء ${reviews.length} مراجعة`);

    // 5. إنشاء سلال التسوق (Carts)
    console.log('🛒 إنشاء سلال التسوق...');
    const carts = await db.Cart.bulkCreate([
      { session_id: 'session_001' },
      { session_id: 'session_002' },
      { session_id: 'session_003' },
      { session_id: 'session_004' },
      { session_id: 'session_005' },
      { session_id: 'session_006' },
      { session_id: 'session_007' }
    ]);
    console.log(`✅ تم إنشاء ${carts.length} سلة تسوق`);

    // 6. إنشاء عناصر سلال التسوق (Cart Items)
    console.log('📝 إنشاء عناصر سلال التسوق...');
    const cartItems = [];
    for (let cart of carts) {
      const numItems = Math.floor(Math.random() * 4) + 1; // 1-4 منتجات في السلة
      const selectedProducts = createdProducts.sort(() => 0.5 - Math.random()).slice(0, numItems);
      
      for (let product of selectedProducts) {
        cartItems.push({
          cart_id: cart.cart_id,
          product_id: product.product_id,
          quantity: Math.floor(Math.random() * 3) + 1 // 1-3 قطع
        });
      }
    }
    await db.CartItem.bulkCreate(cartItems);
    console.log(`✅ تم إنشاء ${cartItems.length} عنصر في سلال التسوق`);

    // 7. إنشاء الطلبات (Orders)
    console.log('📋 إنشاء الطلبات...');
    const orders = [];
    const statuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
    
    for (let store of stores) {
      const numOrders = Math.floor(Math.random() * 5) + 3; // 3-7 طلبات لكل متجر
      for (let i = 0; i < numOrders; i++) {
        const storeProducts = createdProducts.filter(p => p.store_id === store.store_id);
        const totalPrice = Math.floor(Math.random() * 1000) + 100; // سعر عشوائي
        
        orders.push({
          store_id: store.store_id,
          total_price: totalPrice,
          status: statuses[Math.floor(Math.random() * statuses.length)],
          is_programmatic: Math.random() > 0.7 // 30% من الطلبات برمجية
        });
      }
    }
    const createdOrders = await db.Order.bulkCreate(orders);
    console.log(`✅ تم إنشاء ${createdOrders.length} طلب`);

    // 8. إنشاء عناصر الطلبات (Order Items)
    console.log('📦 إنشاء عناصر الطلبات...');
    const orderItems = [];
    
    for (let order of createdOrders) {
      const storeProducts = createdProducts.filter(p => p.store_id === order.store_id);
      const numItems = Math.floor(Math.random() * 4) + 1; // 1-4 منتجات في الطلب
      const selectedProducts = storeProducts.sort(() => 0.5 - Math.random()).slice(0, numItems);
      
      for (let product of selectedProducts) {
        const quantity = Math.floor(Math.random() * 3) + 1;
        orderItems.push({
          order_id: order.order_id,
          product_id: product.product_id,
          quantity: quantity,
          price_at_time: product.price
        });
      }
    }
    await db.OrderItem.bulkCreate(orderItems);
    console.log(`✅ تم إنشاء ${orderItems.length} عنصر في الطلبات`);

    // 9. إنشاء معلومات الشحن (Shipping)
    console.log('🚚 إنشاء معلومات الشحن...');
    const shipping = [];
    const customerNames = ['أحمد محمد العلي', 'فاطمة عبدالله الزهراني', 'محمد سعد القحطاني', 'نورا خالد السليم', 'عبدالرحمن أحمد الغامدي'];
    const cities = ['الرياض', 'جدة', 'الدمام', 'الخبر', 'المدينة المنورة', 'مكة المكرمة', 'تبوك', 'أبها', 'الطائف', 'بريدة'];
    const shippingMethods = ['توصيل عادي', 'توصيل سريع', 'توصيل فوري', 'البريد السعودي'];
    const shippingStatuses = ['preparing', 'shipped', 'in_transit', 'delivered'];
    
    for (let order of createdOrders) {
      const customerName = customerNames[Math.floor(Math.random() * customerNames.length)];
      const city = cities[Math.floor(Math.random() * cities.length)];
      
      shipping.push({
        order_id: order.order_id,
        customer_name: customerName,
        customer_phone: `+96650${Math.floor(Math.random() * 9000000) + 1000000}`,
        customer_whatsapp: `+96650${Math.floor(Math.random() * 9000000) + 1000000}`,
        recipient_name: Math.random() > 0.3 ? customerName : customerNames[Math.floor(Math.random() * customerNames.length)],
        shipping_address: `${city}، حي النموذجي، شارع ${Math.floor(Math.random() * 50) + 1}، فيلا ${Math.floor(Math.random() * 200) + 1}`,
        destination: city,
        shipping_method: shippingMethods[Math.floor(Math.random() * shippingMethods.length)],
        tracking_number: `SA${Math.floor(Math.random() * 9000000000) + 1000000000}`,
        shipping_status: shippingStatuses[Math.floor(Math.random() * shippingStatuses.length)],
        shipped_at: Math.random() > 0.5 ? new Date(Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)) : null, // خلال الأسبوع الماضي
        delivered_at: Math.random() > 0.7 ? new Date(Date.now() - Math.floor(Math.random() * 3 * 24 * 60 * 60 * 1000)) : null // خلال 3 أيام
      });
    }
    await db.Shipping.bulkCreate(shipping);
    console.log(`✅ تم إنشاء ${shipping.length} معلومة شحن`);

    // طباعة ملخص البيانات المُنشأة
    console.log('\n📊 ملخص البيانات المُنشأة:');
    console.log('================================');
    console.log(`👥 المستخدمين: ${users.length}`);
    console.log(`🏪 المتاجر: ${stores.length}`);
    console.log(`📦 المنتجات: ${createdProducts.length}`);
    console.log(`⭐ المراجعات: ${reviews.length}`);
    console.log(`🛒 سلال التسوق: ${carts.length}`);
    console.log(`📝 عناصر سلال التسوق: ${cartItems.length}`);
    console.log(`📋 الطلبات: ${createdOrders.length}`);
    console.log(`📦 عناصر الطلبات: ${orderItems.length}`);
    console.log(`🚚 معلومات الشحن: ${shipping.length}`);
    console.log('================================');
    
    // طباعة إحصائيات إضافية
    console.log('\n📈 إحصائيات المتاجر:');
    for (let store of stores) {
      const storeProducts = createdProducts.filter(p => p.store_id === store.store_id);
      const storeOrders = createdOrders.filter(o => o.store_id === store.store_id);
      console.log(`${store.store_name}: ${storeProducts.length} منتج، ${storeOrders.length} طلب`);
    }

    console.log('\n🎉 تم إنشاء جميع البيانات التجريبية بنجاح!');
    console.log('💡 يمكنك الآن البدء في اختبار التطبيق مع هذه البيانات');

  } catch (error) {
    console.error('❌ خطأ في إنشاء البيانات:', error);
    throw error;
  }
}

// تشغيل عملية البذر
seedDatabase()
  .then(() => {
    console.log('✅ تمت عملية البذر بنجاح');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ فشلت عملية البذر:', error);
    process.exit(1);
  });