# نظام مخازن مصنع كاسات وعدادات — أونلاين

نسخة React / Vite بواجهة عربية بهوية الفحم/الذهب/العاجي حسب دليل الهوية، مع Supabase Auth وPostgres وقواعد RLS.

## 1) تثبيت الأدوات

ثبّت Node.js LTS من https://nodejs.org ثم افتح terminal جديد وتأكد من `node -v` و`npm -v`.

## 2) إنشاء قاعدة البيانات

1. أنشئ مشروع على https://supabase.com/dashboard.
2. افتح **SQL Editor** ونفّذ محتوى `supabase.sql` بالكامل.
3. من **Authentication → Providers → Email** عطّل **Allow new users to sign up** أو خيار السماح بالتسجيل المفتوح؛ الحسابات ينشئها مدير النظام فقط.
4. من **Authentication → Users** أضف حساب الموظف الأول (مدير)، مع بريد وكلمة مرور. إذا كانت هناك رسالة تأكيد، أكد البريد قبل تسجيل الدخول.
5. ارجع إلى **SQL Editor** ونفّذ السطر التالي مع تغيير البريد:

```sql
insert into public.warehouse_members(user_id,role)
select id,'admin' from auth.users where email='YOUR_ADMIN_EMAIL@example.com'
on conflict (user_id) do update set role=excluded.role;
```

لإضافة موظف آخر أنشئ المستخدم من Authentication → Users، ثم نفس SQL لكن استخدم `editor` (إضافة + وارد/صادر) أو `viewer` (عرض فقط). المدير وحده يقدر يأرشف المنتجات.

**ملحوظة:** أسماء الموظفين وصلاحياتهم تتحدد من Supabase Dashboard حاليًا؛ لا توجد شاشة إدارة مستخدمين داخل التطبيق.

## 3) ربط التطبيق

انسخ `.env.example` إلى `.env`، واملأ القيم من **Project Settings → API Keys / Connect** في Supabase:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

استخدم **publishable / anon key فقط**. لا تضع `service_role` أو مفتاح secret في الكود أو Vercel frontend. ملف `.env` لا يُرفع لـ Git.

```bash
npm install
npm run dev
```

## 4) النشر على Vercel

- ارفع المشروع إلى GitHub (بدون `.env`).
- من Vercel: Add New → Project → استورد مستودع GitHub.
- Framework: Vite، Build: `npm run build`، Output: `dist`.
- Settings → Environment Variables: أضف `VITE_SUPABASE_URL` و`VITE_SUPABASE_PUBLISHABLE_KEY` بنفس القيم، ثم Deploy.
- داخل Supabase → Authentication → URL Configuration: اضبط Site URL على رابط Vercel، وأضف الرابط ضمن Redirect URLs حسب طريقة الدخول المستخدمة.
- تأكد أن المستخدمين التجريبيين مسجلون في `warehouse_members` قبل المشاركة.

## ملاحظات مهمة

- **بياناتك القديمة الموجودة في localStorage لن تنتقل تلقائيًا**. اعمل نسخة احتياطية منها أولًا؛ استيرادها يحتاج خطوة منفصلة لتجنب تكرار الأكواد والكميات.
- الرصيد والوارد والصادر محفوظون مركزيًا؛ الدوال في SQL بتضمن تحديث الكمية وتسجيل الحركة داخل Transaction واحدة مع قفل الصف، وترفض الصادر الأعلى من الرصيد.
- عرض البيانات يتحدث تلقائيًا كل 15 ثانية، وفيه زر تحديث يدوي. هذا ليس بثًا لحظيًا مباشرًا.
- سجل الواجهة يعرض آخر 500 حركة؛ قاعدة البيانات تحتفظ بكل الحركات.
- احتفظ بنسخة احتياطية من قاعدة البيانات حسب احتياج العمل. جرب بصلاحيات `admin`, `editor`, `viewer` قبل استخدام بيانات المصنع الحقيقية.
- لا يوجد حساب Supabase أو رابط Vercel تم إنشاؤه تلقائيًا؛ الربط يتطلب إعداد المشروعين على حسابك.

## الرسوم البيانية الديناميكية (إضافة جديدة)

أضيفت لوحة تحليلات أعلى نموذج إضافة المنتجات:
- **الوارد والصادر يوميًا**: آخر 7 / 14 / 30 يوم، محسوبة من `movements` (مع استبعاد حركات الرصيد الافتتاحي).
- **توزيع قيمة المخزون**: إجمالي `quantity × price` لكل فئة.
- **أعلى 5 منتجات بالقيمة**: محسوبة من المنتجات النشطة.

الرسوم تتغير مباشرة بعد إضافة منتج أو حركة وارد/صادر، وكذلك مع التحديث التلقائي الموجود في النظام كل 15 ثانية أو زر تحديث. لا توجد مكتبة رسوم إضافية؛ استخدمنا SVG وReact فقط، ولا تحتاج إلى تنفيذ SQL جديد.

**مهم:** مخطط الحركة اليومية يستند إلى آخر 500 حركة التي يجلبها التطبيق حاليًا. إذا كانت هناك أكثر من 500 حركة في الفترة المحددة، فقد يكون الرسم غير مكتمل. يمكن لاحقًا إضافة استعلام تجميعي بالخادم لدقة تاريخية كاملة.
"# kasat-warehouse" 
