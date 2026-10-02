# منصة تانية بكالوريا — GitHub Pages + Google Sheets

هذه النسخة تستخدم GitHub Pages للواجهة، وGoogle Apps Script + Google Sheet كقاعدة بيانات مشتركة.

## ما تم ربطه
- الامتحانات والأسئلة من Google Sheet.
- تسليم الامتحانات والدرجات في Google Sheet.
- نتائج الطلاب من قاعدة البيانات.
- الكتب: المادة + اسم الكتاب + رابط Google Drive في جدول `Books`.
- إضافة وحذف الكتب من لوحة الإدارة.
- جلسة إدارة مؤقتة عبر Apps Script.

## الملفات
- `index.html` — الموقع الجاهز لـ GitHub Pages.
- `mo.png` — صورة المؤسس.
- `Code.gs` — كود Google Apps Script المحدث، ويتضمن جدول `Books`.
- `.nojekyll` و`404.html`.

## مهم قبل الاستخدام
1. افتح Google Apps Script المرتبط بنفس Google Sheet.
2. حدّث `Code.gs` بالكود الموجود هنا.
3. تأكد أن Script Property باسم `ADMIN_TOKEN` تحتوي كلمة مرور الإدارة `25112009`. **لا تضع كلمة المرور داخل GitHub أو داخل `index.html`.**
4. شغّل الدالة `setup()` مرة واحدة لإنشاء جدول `Books` مع الحفاظ على الجداول الموجودة.
5. من Deploy → Manage deployments حدّث نشر Web App ليستخدم النسخة الجديدة.
6. اجعل Web App متاحًا لمن يملك الرابط / Anyone حسب إعدادات حسابك حتى يستطيع GitHub Pages الاتصال به.

## رفع GitHub
ارفع `index.html` و`mo.png` و`.nojekyll` و`404.html` إلى المستودع. لا ترفع `Code.gs` إلى مستودع عام إذا كان يحتوي أي أسرار أو إعدادات خاصة. الأفضل الاحتفاظ به داخل Apps Script فقط.

## ملاحظة
هذه النسخة لم تعد تعتمد على `localStorage` للامتحانات والنتائج والكتب. البيانات الأساسية مشتركة عبر Google Sheet.
