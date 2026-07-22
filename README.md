# Signature Studio

เว็บแอปสำหรับปรับไฟล์ลายเซ็นให้มีขนาด ตำแหน่ง พื้นหลัง และคุณภาพสม่ำเสมอ โดยประมวลผลภาพทั้งหมดภายในเบราว์เซอร์

## ความสามารถใน MVP

- นำเข้า PNG, JPG, SVG และ PDF (เลือกหน้าได้)
- เพิ่มไฟล์ด้วย file picker, drag & drop หรือ clipboard และทำงานเป็นชุดได้สูงสุด 200 ไฟล์
- ลบพื้นหลังสีขาว, ครอบตัดอัตโนมัติ, ปรับความสูง/ระยะขอบ/ตำแหน่ง, หมุนและกลับด้าน
- พรีวิวต้นฉบับเทียบผลลัพธ์แบบ split view พร้อม grid, ruler, safe area และ checkerboard
- วิเคราะห์คุณภาพแบบ local พร้อมคะแนนและคำแนะนำ
- ส่งออก PNG, JPG, SVG, PDF และ ZIP สำหรับหลายไฟล์
- บันทึกพรีเซ็ตและการตั้งค่าไว้ใน localStorage; ไฟล์ต้นฉบับไม่ถูกอัปโหลด
- PWA service worker สำหรับการเปิดใช้งานซ้ำแบบ offline หลังเข้าใช้งานครั้งแรก

## การพัฒนา

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5173
```

ตรวจ production build และ automated tests:

```powershell
npm.cmd test
```

## ขอบเขตของรุ่นนี้

- การลบพื้นหลังและการให้คะแนนใช้ image heuristics บนอุปกรณ์ ไม่ใช่โมเดล AI
- SVG ที่ผ่าน pixel processing จะส่งออกเป็น SVG wrapper ที่ฝังภาพ PNG
- PDF ส่งออกเป็น raster PDF เพื่อรักษาผลลัพธ์ให้ตรงกับพรีวิว
- ประวัติ undo/redo และพรีเซ็ตเป็นระดับ workspace; ยังไม่มี manual path editing หรือ enterprise policy server
