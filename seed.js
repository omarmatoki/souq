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
    console.log('👥 إنشاء المستخدمين...');
    const users = await db.User.bulkCreate([
      {
        username: 'ahmed_electronics',
        password_hash: await bcrypt.hash('password123', 10),
        whatsapp_number: '+966501234567',
        id_image: 'ahmed_id.jpg',
        role: 'merchant',
        is_verified: true
      },
      {
        username: 'fatima_fashion',
        password_hash: await bcrypt.hash('password123', 10),
        whatsapp_number: '+966502345678',
        id_image: 'fatima_id.jpg',
        role: 'merchant',
        is_verified: true
      },
      {
        username: 'mohammed_books',
        password_hash: await bcrypt.hash('password123', 10),
        whatsapp_number: '+966503456789',
        id_image: 'mohammed_id.jpg',
        role: 'merchant',
        is_verified: true
      },
      {
        username: 'sara_cosmetics',
        password_hash: await bcrypt.hash('password123', 10),
        whatsapp_number: '+966504567890',
        id_image: 'sara_id.jpg',
        role: 'merchant',
        is_verified: true
      },
      {
        username: 'omar_sports',
        password_hash: await bcrypt.hash('password123', 10),
        whatsapp_number: '+966505678901',
        id_image: 'omar_id.jpg',
        role: 'merchant',
        is_verified: true
      },
      {
        username: 'admin',
        password_hash: await bcrypt.hash('admin123', 10),
        whatsapp_number: '+966500000000',
        id_image: 'admin_id.jpg',
        role: 'admin',
        is_verified: true
      }
    ]);
    console.log(`✅ تم إنشاء ${users.length} مستخدم`);

    // 2. إنشاء المتاجر (Stores)
    console.log('🏪 إنشاء المتاجر...');
    const stores = await db.Store.bulkCreate([
      {
        user_id: users[0].user_id,
        store_name: 'متجر أحمد للإلكترونيات',
        store_address: 'الرياض، حي النرجس، طريق الملك عبدالعزيز، مجمع الإلكترونيات',
        description: 'متجر متخصص في أحدث الأجهزة الإلكترونية والهواتف الذكية مع ضمان شامل وخدمة ما بعد البيع المميزة',
        images: JSON.stringify(['electronics_store_1.jpg', 'electronics_store_2.jpg', 'electronics_store_3.jpg']),
        logo_image: 'logo_ahmed_electronics.png'
      },
      {
        user_id: users[1].user_id,
        store_name: 'بوتيك فاطمة للأزياء',
        store_address: 'جدة، حي الزهراء، شارع التحلية، برج الأزياء الدولي',
        description: 'بوتيك راقي يضم أحدث صيحات الموضة النسائية العالمية والمحلية بجودة عالية وأسعار منافسة',
        images: JSON.stringify(['fashion_store_1.jpg', 'fashion_store_2.jpg', 'fashion_store_3.jpg', 'fashion_store_4.jpg']),
        logo_image: 'logo_fatima_fashion.png'
      },
      {
        user_id: users[2].user_id,
        store_name: 'مكتبة محمد الثقافية',
        store_address: 'الدمام، حي الفيصلية، شارع الأمير محمد بن فهد، المجمع الثقافي',
        description: 'مكتبة شاملة تضم مجموعة واسعة من الكتب العربية والعالمية، القرطاسية، والأدوات المكتبية المتطورة',
        images: JSON.stringify(['bookstore_1.jpg', 'bookstore_2.jpg', 'bookstore_3.jpg']),
        logo_image: 'logo_mohammed_books.png'
      },
      {
        user_id: users[3].user_id,
        store_name: 'متجر سارة للتجميل',
        store_address: 'الخبر، حي اليرموك، شارع الملك خالد، مجمع التجميل والعطور',
        description: 'متجر متخصص في مستحضرات التجميل والعطور الأصلية من أشهر العلامات التجارية العالمية',
        images: JSON.stringify(['cosmetics_store_1.jpg', 'cosmetics_store_2.jpg']),
        logo_image: 'logo_sara_cosmetics.png'
      },
      {
        user_id: users[4].user_id,
        store_name: 'متجر عمر الرياضي',
        store_address: 'المدينة المنورة، حي العوالي، شارع قباء، المجمع الرياضي المتكامل',
        description: 'متجر رياضي شامل يوفر أحدث الأدوات والمعدات الرياضية للمحترفين والهواة من جميع الأعمار',
        images: JSON.stringify(['sports_store_1.jpg', 'sports_store_2.jpg', 'sports_store_3.jpg', 'sports_store_4.jpg']),
        logo_image: 'logo_omar_sports.png'
      }
    ]);
    console.log(`✅ تم إنشاء ${stores.length} متجر`);

    // 3. إنشاء المنتجات (Products) - 10 منتجات لكل متجر
    console.log('📦 إنشاء المنتجات...');
    const products = [];

    // منتجات متجر أحمد للإلكترونيات
    const electronicsProducts = [
      { name: 'آيفون 15 برو', description: 'أحدث هواتف آبل بكاميرا متطورة ومعالج A17 Pro القوي', price: 4500.00, stock_quantity: 25 },
      { name: 'سامسونج جالاكسي S24 Ultra', description: 'هاتف سامسونج الرائد بقلم S Pen وكاميرا 200 ميجا بكسل', price: 4200.00, stock_quantity: 30 },
      { name: 'لابتوب MacBook Air M3', description: 'لابتوب آبل بمعالج M3 الجديد وبطارية تدوم لـ 18 ساعة', price: 6500.00, stock_quantity: 15 },
      { name: 'iPad Pro 12.9 بوصة', description: 'جهاز لوحي متقدم بمعالج M2 ومثالي للعمل والإبداع', price: 3800.00, stock_quantity: 20 },
      { name: 'سماعات AirPods Pro 2', description: 'سماعات لاسلكية بتقنية إلغاء الضوضاء المتطورة', price: 950.00, stock_quantity: 40 },
      { name: 'ساعة Apple Watch Series 9', description: 'ساعة ذكية متقدمة لمراقبة الصحة واللياقة البدنية', price: 1800.00, stock_quantity: 35 },
      { name: 'شاشة Samsung 4K 65 بوصة', description: 'تلفزيون ذكي بدقة 4K وتقنية HDR المتطورة', price: 2800.00, stock_quantity: 12 },
      { name: 'كاميرا Sony Alpha A7 IV', description: 'كاميرا احترافية بدقة 33 ميجا بكسل وتسجيل فيديو 4K', price: 8500.00, stock_quantity: 8 },
      { name: 'PlayStation 5', description: 'جهاز ألعاب سوني الأحدث بأداء استثنائي وألعاب حصرية', price: 2200.00, stock_quantity: 18 },
      { name: 'روبوت مكنسة Roomba', description: 'مكنسة كهربائية ذكية تعمل بالذكاء الاصطناعي للتنظيف الآلي', price: 1500.00, stock_quantity: 22 }
    ];

    for (let product of electronicsProducts) {
      products.push({
        store_id: stores[0].store_id,
        ...product,
        images: JSON.stringify([
          `${product.name.replace(/\s+/g, '_').replace(/[^\w]/g, '')}_1.jpg`,
          `${product.name.replace(/\s+/g, '_').replace(/[^\w]/g, '')}_2.jpg`,
          `${product.name.replace(/\s+/g, '_').replace(/[^\w]/g, '')}_3.jpg`
        ])
      });
    }

    // منتجات بوتيك فاطمة للأزياء
    const fashionProducts = [
      { name: 'فستان سهرة مخمل', description: 'فستان سهرة أنيق من المخمل الفاخر مع تطريز ذهبي يدوي', price: 850.00, stock_quantity: 15 },
      { name: 'حقيبة يد جلدية إيطالية', description: 'حقيبة يد فاخرة من الجلد الإيطالي الأصلي بتصميم عصري', price: 1200.00, stock_quantity: 25 },
      { name: 'حذاء كعب عالي فرنسي', description: 'حذاء نسائي أنيق من التصميم الفرنسي بكعب عالي مريح', price: 680.00, stock_quantity: 30 },
      { name: 'عباية كريب مطرزة', description: 'عباية أنيقة من الكريب الفاخر مع تطريز يدوي مميز', price: 450.00, stock_quantity: 40 },
      { name: 'وشاح حرير طبيعي', description: 'وشاح من الحرير الطبيعي بنقوش عربية تراثية معاصرة', price: 180.00, stock_quantity: 50 },
      { name: 'بلوزة شيفون مطبوعة', description: 'بلوزة عصرية من الشيفون بطباعة فنية جذابة', price: 220.00, stock_quantity: 35 },
      { name: 'تنورة بليسيه', description: 'تنورة أنيقة بتصميم البليسيه العصري ومناسبة لجميع المناسبات', price: 280.00, stock_quantity: 28 },
      { name: 'جاكيت تويد كلاسيكي', description: 'جاكيت كلاسيكي من قماش التويد الفاخر بتصميم أنيق', price: 920.00, stock_quantity: 20 },
      { name: 'فستان كاجوال قطني', description: 'فستان يومي مريح من القطن الطبيعي بألوان زاهية', price: 320.00, stock_quantity: 45 },
      { name: 'معطف شتوي طويل', description: 'معطف شتوي أنيق وطويل من الصوف الطبيعي المقاوم للبرد', price: 1150.00, stock_quantity: 18 }
    ];

    for (let product of fashionProducts) {
      products.push({
        store_id: stores[1].store_id,
        ...product,
        images: JSON.stringify([
          `${product.name.replace(/\s+/g, '_').replace(/[^\w]/g, '')}_1.jpg`,
          `${product.name.replace(/\s+/g, '_').replace(/[^\w]/g, '')}_2.jpg`
        ])
      });
    }

    // منتجات مكتبة محمد الثقافية
    const bookProducts = [
      { name: 'موسوعة التاريخ الإسلامي - 12 مجلد', description: 'موسوعة شاملة تغطي التاريخ الإسلامي من البداية حتى العصر الحديث', price: 480.00, stock_quantity: 25 },
      { name: 'مجموعة أقلام خط عربي فاخرة', description: 'مجموعة أقلام احترافية للخط العربي مع محابر ملونة وأوراق مخصوصة', price: 220.00, stock_quantity: 35 },
      { name: 'آلة حاسبة علمية متقدمة', description: 'آلة حاسبة علمية للطلاب والمهندسين مع 500+ وظيفة رياضية', price: 180.00, stock_quantity: 50 },
      { name: 'أطلس العالم الجغرافي المصور', description: 'أطلس جغرافي حديث بخرائط عالية الدقة ومعلومات محدثة', price: 320.00, stock_quantity: 30 },
      { name: 'قاموس المورد الإنجليزي-العربي', description: 'قاموس شامل للترجمة مع أكثر من 70 ألف مصطلح ومعنى', price: 150.00, stock_quantity: 40 },
      { name: 'مجموعة روايات الأدب العربي', description: 'مجموعة من أشهر الروايات العربية لكبار الكتاب والأدباء', price: 380.00, stock_quantity: 28 },
      { name: 'دفتر ملاحظات جلدي فاخر A4', description: 'دفتر ملاحظات بغلاف جلدي فاخر وأوراق كريمية عالية الجودة', price: 95.00, stock_quantity: 60 },
      { name: 'مجموعة أدوات هندسية احترافية', description: 'مجموعة كاملة من الأدوات الهندسية للطلاب والمهندسين', price: 240.00, stock_quantity: 32 },
      { name: 'كتاب تعلم البرمجة للمبتدئين', description: 'كتاب شامل لتعلم أساسيات البرمجة بلغات متعددة مع أمثلة عملية', price: 125.00, stock_quantity: 45 },
      { name: 'لوح كتابة إلكتروني ذكي', description: 'لوح كتابة إلكتروني يحفظ ما تكتب ويمكن مسحه بضغطة زر', price: 420.00, stock_quantity: 22 }
    ];

    for (let product of bookProducts) {
      products.push({
        store_id: stores[2].store_id,
        ...product,
        images: JSON.stringify([
          `${product.name.replace(/\s+/g, '_').replace(/[^\w]/g, '')}_1.jpg`,
          `${product.name.replace(/\s+/g, '_').replace(/[^\w]/g, '')}_2.jpg`
        ])
      });
    }

    // منتجات متجر سارة للتجميل
    const cosmeticsProducts = [
      { name: 'عطر شانيل رقم 5', description: 'عطر فرنسي أيقوني برائحة الياسمين والورد الطبيعي', price: 650.00, stock_quantity: 20 },
      { name: 'كريم لانكوم المضاد للشيخوخة', description: 'كريم مضاد للشيخوخة يحارب التجاعيد ويرطب البشرة بعمق', price: 420.00, stock_quantity: 30 },
      { name: 'مجموعة أحمر الشفاه MAC', description: 'مجموعة من 12 لون من أحمر الشفاه بألوان عصرية وثبات عالي', price: 380.00, stock_quantity: 25 },
      { name: 'ماسكارا ديور المقاومة للماء', description: 'ماسكارا تدوم طوال اليوم ومقاومة للماء مع فرشاة دقيقة', price: 180.00, stock_quantity: 45 },
      { name: 'بودرة شانيل المضغوطة', description: 'بودرة مضغوطة تعطي إطلالة طبيعية وتدوم لساعات طويلة', price: 320.00, stock_quantity: 28 },
      { name: 'عود كمبودي أصلي فاخر', description: 'عود طبيعي من كمبوديا برائحة فريدة ومميزة للمناسبات الخاصة', price: 850.00, stock_quantity: 15 },
      { name: 'كريم أساس فيورديمايا', description: 'كريم أساس إيطالي بتغطية طبيعية ومناسب لجميع أنواع البشرة', price: 220.00, stock_quantity: 35 },
      { name: 'مجموعة فراشي المكياج الاحترافية', description: 'مجموعة من 15 فرشاة احترافية لجميع تقنيات المكياج', price: 280.00, stock_quantity: 32 },
      { name: 'كريم العين المرطب', description: 'كريم خاص لمنطقة العين يقلل الهالات السوداء ويرطب البشرة الحساسة', price: 150.00, stock_quantity: 40 },
      { name: 'بخاخ تثبيت المكياج', description: 'بخاخ احترافي لتثبيت المكياج طوال اليوم مع حماية من العوامل الخارجية', price: 120.00, stock_quantity: 50 }
    ];

    for (let product of cosmeticsProducts) {
      products.push({
        store_id: stores[3].store_id,
        ...product,
        images: JSON.stringify([
          `${product.name.replace(/\s+/g, '_').replace(/[^\w]/g, '')}_1.jpg`,
          `${product.name.replace(/\s+/g, '_').replace(/[^\w]/g, '')}_2.jpg`
        ])
      });
    }

    // منتجات متجر عمر الرياضي
    const sportsProducts = [
      { name: 'حذاء نايكي اير جوردان', description: 'حذاء كرة سلة أيقوني مع تقنية Air للراحة القصوى أثناء اللعب', price: 750.00, stock_quantity: 30 },
      { name: 'بدلة رياضية أديداس كاملة', description: 'بدلة رياضية احترافية من الأقمشة التقنية المقاومة للرطوبة', price: 320.00, stock_quantity: 25 },
      { name: 'كرة قدم فيفا الرسمية', description: 'كرة قدم معتمدة من الفيفا للمباريات والتدريبات الاحترافية', price: 180.00, stock_quantity: 40 },
      { name: 'دراجة هوائية جبلية احترافية', description: 'دراجة هوائية بـ 21 سرعة ومناسبة للطرق الوعرة والجبلية', price: 2200.00, stock_quantity: 12 },
      { name: 'مجموعة أثقال متكاملة', description: 'مجموعة أثقال من 5 كيلو إلى 50 كيلو مع حامل معدني قوي', price: 1500.00, stock_quantity: 15 },
      { name: 'ساعة جارمين الرياضية GPS', description: 'ساعة رياضية ذكية مع GPS ومراقبة معدل ضربات القلب', price: 1200.00, stock_quantity: 20 },
      { name: 'حقيبة رياضية نايكي', description: 'حقيبة رياضية واسعة ومقاومة للماء مع جيوب متعددة', price: 220.00, stock_quantity: 35 },
      { name: 'جهاز مشي كهربائي منزلي', description: 'جهاز مشي كهربائي للاستخدام المنزلي مع شاشة LCD وبرامج متنوعة', price: 3500.00, stock_quantity: 8 },
      { name: 'مضرب تنس ويلسون احترافي', description: 'مضرب تنس احترافي بتقنية متقدمة للاعبين المحترفين', price: 450.00, stock_quantity: 18 },
      { name: 'حذاء جري أسيكس متخصص', description: 'حذاء جري بتقنية امتصاص الصدمات ومناسب للمسافات الطويلة', price: 520.00, stock_quantity: 28 }
    ];

    for (let product of sportsProducts) {
      products.push({
        store_id: stores[4].store_id,
        ...product,
        images: JSON.stringify([
          `${product.name.replace(/\s+/g, '_').replace(/[^\w]/g, '')}_1.jpg`,
          `${product.name.replace(/\s+/g, '_').replace(/[^\w]/g, '')}_2.jpg`,
          `${product.name.replace(/\s+/g, '_').replace(/[^\w]/g, '')}_3.jpg`
        ])
      });
    }

    const createdProducts = await db.Product.bulkCreate(products);
    console.log(`✅ تم إنشاء ${createdProducts.length} منتج`);

    // 4. إنشاء سلال التسوق (Carts)
    console.log('🛒 إنشاء سلال التسوق...');
    const carts = await db.Cart.bulkCreate([
      { session_id: 'customer_session_001' },
      { session_id: 'customer_session_002' },
      { session_id: 'customer_session_003' },
      { session_id: 'customer_session_004' },
      { session_id: 'customer_session_005' },
      { session_id: 'customer_session_006' },
      { session_id: 'customer_session_007' },
      { session_id: 'customer_session_008' },
      { session_id: 'customer_session_009' },
      { session_id: 'customer_session_010' }
    ]);
    console.log(`✅ تم إنشاء ${carts.length} سلة تسوق`);

    // 5. إنشاء عناصر سلال التسوق (Cart Items)
    console.log('📝 إنشاء عناصر سلال التسوق...');
    const cartItems = [];
    for (let cart of carts) {
      const numItems = Math.floor(Math.random() * 5) + 1; // 1-5 منتجات في السلة
      const selectedProducts = createdProducts
        .sort(() => 0.5 - Math.random())
        .slice(0, numItems);
      
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

    // 6. إنشاء الطلبات (Orders)
    console.log('📋 إنشاء الطلبات...');
    const orders = [];
    const statuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    const customerSessions = [
      'customer_session_101', 'customer_session_102', 'customer_session_103',
      'customer_session_104', 'customer_session_105', 'customer_session_106',
      'customer_session_107', 'customer_session_108', 'customer_session_109',
      'customer_session_110', 'customer_session_111', 'customer_session_112',
      'customer_session_113', 'customer_session_114', 'customer_session_115'
    ];
    
    for (let store of stores) {
      const numOrders = Math.floor(Math.random() * 8) + 5; // 5-12 طلب لكل متجر
      for (let i = 0; i < numOrders; i++) {
        const customerSession = customerSessions[Math.floor(Math.random() * customerSessions.length)];
        const storeProducts = createdProducts.filter(p => p.store_id === store.store_id);
        
        // حساب إجمالي السعر بناءً على منتجات فعلية
        let totalPrice = 0;
        const numOrderItems = Math.floor(Math.random() * 3) + 1; // 1-3 منتجات في الطلب
        const selectedProducts = storeProducts
          .sort(() => 0.5 - Math.random())
          .slice(0, numOrderItems);
        
        for (let product of selectedProducts) {
          const quantity = Math.floor(Math.random() * 3) + 1;
          totalPrice += parseFloat(product.price) * quantity;
        }
        
        orders.push({
          store_id: store.store_id,
          customer_session_id: customerSession,
          total_price: totalPrice.toFixed(2),
          status: statuses[Math.floor(Math.random() * statuses.length)],
          is_programmatic: Math.random() > 0.8 // 20% من الطلبات برمجية
        });
      }
    }
    const createdOrders = await db.Order.bulkCreate(orders);
    console.log(`✅ تم إنشاء ${createdOrders.length} طلب`);

    // 7. إنشاء عناصر الطلبات (Order Items)
    console.log('📦 إنشاء عناصر الطلبات...');
    const orderItems = [];
    
    for (let order of createdOrders) {
      const storeProducts = createdProducts.filter(p => p.store_id === order.store_id);
      const numItems = Math.floor(Math.random() * 4) + 1; // 1-4 منتجات في الطلب
      const selectedProducts = storeProducts
        .sort(() => 0.5 - Math.random())
        .slice(0, numItems);
      
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

    // 8. إنشاء معلومات الشحن (Shipping)
    console.log('🚚 إنشاء معلومات الشحن...');
    const shipping = [];
    const customerNames = [
      'أحمد محمد العلي', 'فاطمة عبدالله الزهراني', 'محمد سعد القحطاني', 
      'نورا خالد السليم', 'عبدالرحمن أحمد الغامدي', 'هند عبدالعزيز الحربي',
      'يوسف إبراهيم النجار', 'ليلى محمود الشهراني', 'سعد عبدالله الغامدي',
      'مريم أحمد السالم', 'خالد محمد العتيبي', 'رانيا سليم القحطاني'
    ];
    
    const cities = [
      'الرياض', 'جدة', 'الدمام', 'الخبر', 'المدينة المنورة', 
      'مكة المكرمة', 'تبوك', 'أبها', 'الطائف', 'بريدة', 'خميس مشيط', 'حائل'
    ];
    
    const shippingMethods = [
      'توصيل عادي (3-5 أيام)', 'توصيل سريع (1-2 يوم)', 
      'توصيل فوري (نفس اليوم)', 'البريد السعودي', 'شركة أرامكس'
    ];
    
    const shippingStatuses = ['preparing', 'shipped', 'in_transit', 'delivered', 'returned'];
    
    // إنشاء معلومات شحن لـ 80% من الطلبات
    const ordersForShipping = createdOrders.filter(() => Math.random() > 0.2);
    
    for (let order of ordersForShipping) {
      const customerName = customerNames[Math.floor(Math.random() * customerNames.length)];
      const city = cities[Math.floor(Math.random() * cities.length)];
      const recipientName = Math.random() > 0.3 ? customerName : customerNames[Math.floor(Math.random() * customerNames.length)];
      
      // تواريخ الشحن والتسليم
      const createdAt = new Date(Date.now() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000)); // آخر 30 يوم
      const shippedAt = Math.random() > 0.3 ? 
        new Date(createdAt.getTime() + Math.floor(Math.random() * 3 * 24 * 60 * 60 * 1000)) : null; // بعد 1-3 أيام من الإنشاء
      const deliveredAt = (shippedAt && Math.random() > 0.5) ? 
        new Date(shippedAt.getTime() + Math.floor(Math.random() * 5 * 24 * 60 * 60 * 1000)) : null; // بعد 1-5 أيام من الشحن
      
      shipping.push({
        customer_session_id: order.customer_session_id,
        order_id: order.order_id,
        customer_name: customerName,
        customer_phone: `+96650${Math.floor(Math.random() * 9000000) + 1000000}`,
        customer_whatsapp: `+96650${Math.floor(Math.random() * 9000000) + 1000000}`,
        recipient_name: recipientName,
        shipping_address: `${city}، حي ${['النرجس', 'الياسمين', 'الورود', 'النخيل', 'الأندلس', 'المروج'][Math.floor(Math.random() * 6)]}، شارع ${Math.floor(Math.random() * 50) + 1}، فيلا ${Math.floor(Math.random() * 300) + 1}`,
        source_address: `${city}، مستودع الشحن المركزي، المنطقة الصناعية`,
        destination: city,
        shipping_method: shippingMethods[Math.floor(Math.random() * shippingMethods.length)],
        tracking_number: `SA${Math.floor(Math.random() * 9000000000) + 1000000000}`,
        shipping_status: shippingStatuses[Math.floor(Math.random() * shippingStatuses.length)],
        shipped_at: shippedAt,
        delivered_at: deliveredAt,
        identity_images: Math.random() > 0.7 ? 
          JSON.stringify([`identity_${Math.floor(Math.random() * 1000)}_front.jpg`, `identity_${Math.floor(Math.random() * 1000)}_back.jpg`]) : null,
        created_at: createdAt
      });
    }
    
    await db.Shipping.bulkCreate(shipping);
    console.log(`✅ تم إنشاء ${shipping.length} معلومة شحن`);

    // 9. إنشاء المراجعات (Reviews)
    console.log('⭐ إنشاء المراجعات...');
    const reviews = [];
    const reviewerNames = [
      'علي محمد الأحمد', 'نورا أحمد السالم', 'خالد عبدالله العتيبي', 'مريم سعد القحطاني',
      'عبدالله محمد الغامدي', 'هند خالد النجار', 'سعد إبراهيم الحربي', 'فاطمة عبدالرحمن الزهراني',
      'يوسف أحمد الشهراني', 'ليلى محمد العبدالله', 'محمد علي السليم', 'رانيا سعد الدوسري'
    ];
    
    const positiveComments = [
      'منتج ممتاز وجودة عالية جداً، أنصح بالشراء بشدة',
      'سعر مناسب ومنتج رائع، تجربة تسوق مميزة',
      'جودة فائقة وخدمة عملاء ممتازة، سأشتري مرة أخرى',
      'المنتج كما هو موصوف بالضبط، تسليم سريع ومعبأ بعناية',
      'راضي جداً عن الشراء، جودة تفوق التوقعات',
      'منتج عملي ومفيد جداً، يستحق كل $ دفعته',
      'خدمة توصيل ممتازة ومنتج بحالة ممتازة',
      'تجربة شراء رائعة من البداية للنهاية',
      'جودة عالية وسعر منافس، أفضل متجر تعاملت معه',
      'منتج أصلي ومضمون، ثقة كاملة في هذا المتجر'
    ];
    
    const neutralComments = [
      'منتج جيد بشكل عام، يمكن تحسين التعبئة',
      'جودة مقبولة مقابل السعر المدفوع',
      'المنتج كما متوقع، لا يوجد مفاجآت سيئة أو جيدة',
      'تجربة عادية، منتج يؤدي الغرض المطلوب'
    ];

    // إنشاء مراجعات للمنتجات (70% من المنتجات تحصل على مراجعات)
    const productsWithReviews = createdProducts.filter(() => Math.random() > 0.3);
    
    for (let product of productsWithReviews) {
      const numReviews = Math.floor(Math.random() * 6) + 2; // 2-7 مراجعات لكل منتج
      for (let i = 0; i < numReviews; i++) {
        const isPositive = Math.random() > 0.2; // 80% مراجعات إيجابية
        const rating = isPositive ? 
          (Math.floor(Math.random() * 2) + 4) : // 4-5 نجوم للإيجابية
          (Math.floor(Math.random() * 3) + 2);   // 2-4 نجوم للمحايدة/سلبية
        
        const comments = isPositive ? positiveComments : neutralComments;
        
        reviews.push({
          product_id: product.product_id,
          reviewer_name: reviewerNames[Math.floor(Math.random() * reviewerNames.length)],
          reviewer_phone: `+96650${Math.floor(Math.random() * 9000000) + 1000000}`,
          rating: rating,
          comment: comments[Math.floor(Math.random() * comments.length)],
          is_verified: Math.random() > 0.1, // 90% من المراجعات معتمدة
          created_at: new Date(Date.now() - Math.floor(Math.random() * 60 * 24 * 60 * 60 * 1000)), // آخر 60 يوم
          updated_at: new Date()
        });
      }
    }

    await db.Review.bulkCreate(reviews);
    console.log(`✅ تم إنشاء ${reviews.length} مراجعة`);

    // طباعة ملخص البيانات المُنشأة
    console.log('\n📊 ملخص البيانات المُنشأة:');
    console.log('============================================');
    console.log(`👥 المستخدمين: ${users.length}`);
    console.log(`🏪 المتاجر: ${stores.length}`);
    console.log(`📦 المنتجات: ${createdProducts.length}`);
    console.log(`🛒 سلال التسوق: ${carts.length}`);
    console.log(`📝 عناصر سلال التسوق: ${cartItems.length}`);
    console.log(`📋 الطلبات: ${createdOrders.length}`);
    console.log(`📦 عناصر الطلبات: ${orderItems.length}`);
    console.log(`🚚 معلومات الشحن: ${shipping.length}`);
    console.log(`⭐ المراجعات: ${reviews.length}`);
    console.log('============================================');
    
    // طباعة إحصائيات تفصيلية للمتاجر
    console.log('\n📈 إحصائيات المتاجر التفصيلية:');
    console.log('============================================');
    for (let store of stores) {
      const storeProducts = createdProducts.filter(p => p.store_id === store.store_id);
      const storeOrders = createdOrders.filter(o => o.store_id === store.store_id);
      const storeOrderItems = orderItems.filter(oi => {
        const order = createdOrders.find(o => o.order_id === oi.order_id);
        return order && order.store_id === store.store_id;
      });
      const storeReviews = reviews.filter(r => {
        const product = createdProducts.find(p => p.product_id === r.product_id);
        return product && product.store_id === store.store_id;
      });
      const storeShipping = shipping.filter(s => {
        const order = createdOrders.find(o => o.order_id === s.order_id);
        return order && order.store_id === store.store_id;
      });

      console.log(`\n🏪 ${store.store_name}:`);
      console.log(`   📦 المنتجات: ${storeProducts.length}`);
      console.log(`   📋 الطلبات: ${storeOrders.length}`);
      console.log(`   📝 عناصر الطلبات: ${storeOrderItems.length}`);
      console.log(`   🚚 معلومات الشحن: ${storeShipping.length}`);
      console.log(`   ⭐ المراجعات: ${storeReviews.length}`);
      
      // حساب متوسط التقييمات
      if (storeReviews.length > 0) {
        const avgRating = storeReviews.reduce((sum, review) => sum + review.rating, 0) / storeReviews.length;
        console.log(`   📊 متوسط التقييم: ${avgRating.toFixed(2)}/5`);
      }
      
      // حساب إجمالي المبيعات
      const totalSales = storeOrders.reduce((sum, order) => sum + parseFloat(order.total_price), 0);
      console.log(`   💰 إجمالي المبيعات: ${totalSales.toFixed(2)} $`);
    }

    // إحصائيات إضافية
    console.log('\n📊 إحصائيات عامة:');
    console.log('============================================');
    
    // التقييمات
    const avgOverallRating = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
    console.log(`⭐ متوسط التقييم العام: ${avgOverallRating.toFixed(2)}/5`);
    
    // إجمالي المبيعات
    const totalAllSales = createdOrders.reduce((sum, order) => sum + parseFloat(order.total_price), 0);
    console.log(`💰 إجمالي المبيعات لجميع المتاجر: ${totalAllSales.toFixed(2)} ريال`);
    
    // حالات الطلبات
    const orderStatusCounts = {};
    createdOrders.forEach(order => {
      orderStatusCounts[order.status] = (orderStatusCounts[order.status] || 0) + 1;
    });
    console.log('\n📋 توزيع حالات الطلبات:');
    Object.entries(orderStatusCounts).forEach(([status, count]) => {
      console.log(`   ${status}: ${count} طلب`);
    });
    
    // حالات الشحن
    const shippingStatusCounts = {};
    shipping.forEach(shipment => {
      shippingStatusCounts[shipment.shipping_status] = (shippingStatusCounts[shipment.shipping_status] || 0) + 1;
    });
    console.log('\n🚚 توزيع حالات الشحن:');
    Object.entries(shippingStatusCounts).forEach(([status, count]) => {
      console.log(`   ${status}: ${count} شحنة`);
    });

    // طباعة بيانات تسجيل الدخول
    console.log('\n🔐 بيانات تسجيل الدخول:');
    console.log('============================================');
    console.log('👤 المدير:');
    console.log('   Username: admin');
    console.log('   Password: admin123');
    console.log('   WhatsApp: +966500000000');
    
    console.log('\n👥 التجار:');
    users.forEach(user => {
      if (user.role === 'merchant') {
        console.log(`   Username: ${user.username}`);
        console.log(`   Password: password123`);
        console.log(`   WhatsApp: ${user.whatsapp_number}`);
        console.log('   ---');
      }
    });

    // طباعة أمثلة على الجلسات المتاحة
    console.log('\n🔑 جلسات العملاء المتاحة للاختبار:');
    console.log('============================================');
    console.log('📋 جلسات الطلبات:');
    const uniqueOrderSessions = [...new Set(createdOrders.map(o => o.customer_session_id))];
    uniqueOrderSessions.slice(0, 5).forEach(session => {
      console.log(`   ${session}`);
    });
    
    console.log('\n🛒 جلسات سلال التسوق:');
    carts.slice(0, 5).forEach(cart => {
      console.log(`   ${cart.session_id}`);
    });

    console.log('\n🎉 تم إنشاء جميع البيانات التجريبية بنجاح!');
    console.log('💡 يمكنك الآن البدء في اختبار التطبيق مع هذه البيانات الشاملة');
    console.log('🔄 لإعادة تشغيل السيدر: node seeder.js');
    console.log('📊 إجمالي السجلات المُنشأة: ' + (
      users.length + stores.length + createdProducts.length + 
      carts.length + cartItems.length + createdOrders.length + 
      orderItems.length + shipping.length + reviews.length
    ));

  } catch (error) {
    console.error('❌ خطأ في إنشاء البيانات:', error);
    console.error('تفاصيل الخطأ:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    throw error;
  }
}

// تشغيل عملية البذر
seedDatabase()
  .then(() => {
    console.log('\n✅ تمت عملية البذر بنجاح');
    console.log('🔄 يمكن الآن إيقاف العملية بأمان');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ فشلت عملية البذر:', error.message);
    process.exit(1);
  });