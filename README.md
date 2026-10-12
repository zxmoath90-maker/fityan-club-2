# نادي فتيان أبها — دليل التشغيل والنشر

## ما يحتاجه الموقع
1. GitHub: https://github.com
2. LiveKit Cloud (صوت وفيديو): https://cloud.livekit.io
3. استضافة: Render https://render.com
4. للطريقة المجانية: Neon https://neon.com (قاعدة بيانات) و UptimeRobot https://uptimerobot.com (يمنع نوم الموقع)

## طريقتان للحفظ
- **مجانية:** ضع DATABASE_URL (من Neon). تُحفظ البيانات والصور في القاعدة، فلا تضيع عند إعادة التشغيل. لا تضع DATA_DIR.
- **مدفوعة:** Render Starter + قرص دائم Mount Path=/var/data و DATA_DIR=/var/data، بدون DATABASE_URL.

## إعدادات Render
Runtime: Node | Build Command: npm install | Start Command: npm start | Health Check Path: /healthz

## متغيرات البيئة
انظر ملف .env.example

## تشغيل محلي (اختياري)
npm install ثم npm start، وافتح http://localhost:3000.

## صلاحيات المساعد (قابلة للتعديل من الإعدادات)
إدارة الاجتماعات، إضافة وتعديل الطلاب، إدارة الأغراض، والإشراف داخل الاجتماع. لا يحذف الطلاب ولا يغيّر الإعدادات والرموز ولا يرفع صور الأغراض نيابةً عن الطالب. تسمية المجموعة متاحة للمشرف والمساعد.

## ما لم يُختبر
فُحصت صياغة الكود فقط. لم يُجرَّب تشغيله على سيرفر حقيقي، ولا الاتصال الحي بين جهازين، ولا مشاركة الشاشة، ولا الرفع من الجوال.
