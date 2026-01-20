# 🔧 دليل استكشاف أخطاء اكتشاف الأجهزة

## المشكلة: لا يتم اكتشاف الأجهزة عبر USB

### 📋 خطوات التشخيص

#### 1. التحقق من Android SDK

افتح **Developer Tools** في VS Code:
- `Help` → `Toggle Developer Tools` → تبويب `Console`

ابحث عن رسائل SDK:
```
✅ SDK found from environment: C:\Users\...\Android\Sdk
```
أو:
```
⚠️ Android SDK not found automatically
```

**إذا لم يُكتشف SDK:**

##### الحل A: تحديد المسار يدويًا

1. اضغط `Ctrl+,` لفتح Settings
2. ابحث عن: `android.sdkPath`
3. أدخل المسار الكامل (مثال: `C:\Users\YourName\AppData\Local\Android\Sdk`)
4. أعد تشغيل VS Code

##### الحل B: استخدام متغيرات البيئة

افتح **Command Prompt** كـ Administrator:

```cmd
# Windows
setx ANDROID_HOME "C:\Users\YourName\AppData\Local\Android\Sdk"
setx ANDROID_SDK_ROOT "C:\Users\YourName\AppData\Local\Android\Sdk"

# ثم أعد تشغيل الكمبيوتر
```

---

#### 2. التحقق من ADB

##### اختبار في Terminal:

```powershell
# اذهب لمجلد SDK
cd C:\Users\YourName\AppData\Local\Android\Sdk\platform-tools

# اختبر ADB
.\adb.exe version
# النتيجة المتوقعة: Android Debug Bridge version X.X.X

# اختبر الأجهزة
.\adb.exe devices
```

**النتيجة المتوقعة:**
```
List of devices attached
5cda021f    device
```

**إذا كانت النتيجة:**
```
List of devices attached
(فارغة)
```

**المشكلة:** الجهاز غير متصل أو USB Debugging غير مُفعّل.

---

#### 3. التحقق من الجهاز

##### على جهاز Android:

1. **تفعيل Developer Options:**
   - `Settings` → `About phone`
   - اضغط على `Build number` **7 مرات**
   - ستظهر رسالة "You are now a developer!"

2. **تفعيل USB Debugging:**
   - ارجع لـ `Settings`
   - `System` → `Developer options`
   - فعّل `USB debugging`

3. **عند توصيل الكابل:**
   - يجب أن تظهر رسالة "Allow USB debugging?"
   - اضغط `OK` أو `Always allow from this computer`

---

#### 4. التحقق من الكابل والمنفذ

- **جرّب كابل USB آخر** (بعض الكوابل للشحن فقط)
- **جرّب منفذ USB آخر** في الكمبيوتر
- **تأكد أن الكابل يدعم نقل البيانات** (Data Transfer)

---

#### 5. إعادة تشغيل ADB Server

في Terminal:

```powershell
cd C:\Users\YourName\AppData\Local\Android\Sdk\platform-tools

# إيقاف ADB Server
.\adb.exe kill-server

# بدء ADB Server من جديد
.\adb.exe start-server

# اختبار الأجهزة
.\adb.exe devices
```

---

#### 6. التحقق من USB Drivers (Windows فقط)

##### تثبيت Universal ADB Driver:

1. حمّل من: https://adb.clockworkmod.com/
2. فك الضغط وشغّل `DriverSetup.exe`
3. أعد توصيل الجهاز

##### التحقق من Device Manager:

1. اضغط `Win+X` → `Device Manager`
2. ابحث عن جهازك تحت:
   - `Portable Devices`
   - `Android Device` أو `ADB Interface`
3. إذا كان عليه علامة تعجب صفراء ⚠️:
   - انقر بزر الماوس الأيمن → `Update driver`
   - اختر `Browse my computer`
   - اذهب لمجلد SDK: `...\Android\Sdk\extras\google\usb_driver`

---

## 🐛 رسائل الخطأ الشائعة

### "Android SDK not found"

**السبب:** لم يتم اكتشاف SDK تلقائيًا.

**الحل:**
```json
// في VS Code Settings (Ctrl+,)
"android.sdkPath": "C:\\Users\\YourName\\AppData\\Local\\Android\\Sdk"
```

---

### "ADB not found at: ..."

**السبب:** مجلد `platform-tools` غير موجود في SDK.

**الحل:**
1. افتح **Android Studio**
2. `Tools` → `SDK Manager`
3. تبويب `SDK Tools`
4. فعّل `Android SDK Platform-Tools`
5. اضغط `Apply`

---

### "device unauthorized"

**السبب:** لم توافق على USB debugging على الجهاز.

**الحل:**
1. افصل الجهاز
2. في الجهاز: `Settings` → `Developer options` → `Revoke USB debugging authorizations`
3. أعد التوصيل
4. وافق على الرسالة

---

### "device offline"

**السبب:** مشكلة في الاتصال.

**الحل:**
```powershell
adb kill-server
adb start-server
```

---

## ✅ اختبار نهائي

بعد تطبيق الحلول، شغّل هذا الأمر:

```powershell
# المسار الكامل لـ ADB
C:\Users\YourName\AppData\Local\Android\Sdk\platform-tools\adb.exe devices -l
```

**النتيجة المتوقعة:**
```
List of devices attached
5cda021f    device usb:1-1 product:RMX2061 model:RMX2061 device:RMX2061L1
```

إذا ظهر جهازك، معناها المشكلة مُحّلة! 🎉

---

## 🔍 ملاحظات إضافية

### لمستخدمي Xiaomi/Redmi:
- فعّل `Install via USB` في Developer options
- فعّل `USB debugging (Security settings)`

### لمستخدمي Samsung:
- بعض الأجهزة تحتاج تعطيل `Samsung Knox`

### لمستخدمي Huawei:
- فعّل `Allow ADB debugging in charge only mode`

---

## 📞 الحصول على مساعدة

إذا استمرت المشكلة:

1. **افحص Console في VS Code:**
   - `Help` → `Toggle Developer Tools`
   - تبويب `Console`
   - ابحث عن رسائل بـ "Failed to refresh devices"

2. **شارك المعلومات التالية:**
   - نظام التشغيل (Windows/Mac/Linux)
   - نوع الجهاز
   - رسالة الخطأ الكاملة من Console
   - نتيجة `adb devices -l` من Terminal

---

**آخر تحديث:** 2026-01-20
