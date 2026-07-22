# Signature Studio — Session Handoff

อัปเดตล่าสุด: 2026-07-22 (Asia/Bangkok)

เอกสารนี้สรุปบริบททั้งหมดจาก session ที่สร้าง ย้าย ตรวจสอบ และเปิดใช้งาน Signature Studio เพื่อให้ chat ใหม่ทำงานต่อได้ทันทีโดยไม่ต้องไล่อ่านประวัติเดิม

## 1. เป้าหมายและผลลัพธ์

เริ่มต้นจาก PRD/SRS ที่ไฟล์:

`C:\Users\noppadol.s\Downloads\README_Signature_Studio.md`

ได้สร้าง Signature Studio เป็น Web Application สำหรับปรับภาพลายเซ็นให้มีขนาด ตำแหน่ง พื้นหลัง และรูปแบบสม่ำเสมอ โดยประมวลผลไฟล์ภายใน Browser เป็นหลักและไม่อัปโหลดไฟล์ต้นฉบับไปยัง server

สถานะปัจจุบัน:

- MVP ใช้งานได้และ production build ผ่าน
- โครงการถูกย้ายออกจาก OneDrive แล้ว
- ตำแหน่งหลักปัจจุบันคือ `C:\GitHub\signature-studio`
- Git working tree สะอาด
- Branch `main` ตรงกับ `origin/main`
- Local dev server กำลังทำงานที่ `http://localhost:5173/`
- ยังไม่ได้เผยแพร่เป็นเว็บไซต์ผ่าน GitHub Pages หรือ Sites production URL

## 2. Git และ Repository

```text
Git root:    C:/GitHub/signature-studio
Branch:      main
Origin:      https://github.com/MyTanuki/signature-studio.git
Local HEAD:  f59dc21fb204eee70bfe05d7e2304cec315a79bb
Remote main: f59dc21fb204eee70bfe05d7e2304cec315a79bb
Commit:      f59dc21 Create from CODEX
Worktree:    clean
```

หมายเหตุ: ระหว่างตรวจ remote มี warning นี้ แต่ `ls-remote` ยังสำเร็จและ hash ตรงกัน:

```text
git: 'credential-manager-core' is not a git command. See 'git --help'.
```

หาก push ในอนาคตติด authentication ให้ตรวจ Git credential helper ก่อนเปลี่ยน remote หรือ token

## 3. วิธีเปิดใช้งาน

### Development server

```powershell
Set-Location 'C:\GitHub\signature-studio'
npm.cmd run dev -- --host 127.0.0.1 --port 5173
```

เปิด:

`http://localhost:5173/`

หาก `node_modules` ไม่มี ให้ติดตั้งก่อน:

```powershell
npm.cmd install
```

### Production build

```powershell
Set-Location 'C:\GitHub\signature-studio'
npm.cmd run build
```

### ตรวจ TypeScript, lint และ tests

```powershell
npm.cmd exec tsc -- --noEmit
npm.cmd run lint
node --test tests\rendered-html.test.mjs
```

ผลล่าสุดใน session นี้:

- TypeScript: ผ่าน
- ESLint: ผ่าน
- Production build: ผ่าน
- Automated tests: 2/2 ผ่าน

## 4. ฟังก์ชันที่สร้างแล้ว

### Import

- PNG
- JPG/JPEG
- SVG
- PDF พร้อมเลือกหน้า
- File picker
- Drag & Drop
- Clipboard paste (`Ctrl+V`)
- Batch queue สูงสุด 200 ไฟล์
- ตรวจขนาดภาพสูงสุด 5,000 × 5,000 px

### Processing

- ลบพื้นหลังสีขาวด้วย local color-distance threshold
- Feather ขอบหลังลบพื้นหลัง
- Auto Crop
- ปรับ contrast
- Grayscale
- กำหนด output width/height
- กำหนด target signature height
- Safe margin
- Alignment 3 × 3
- Rotate ±90°
- Flip horizontal/vertical
- พื้นหลัง transparent หรือ white

### Preview และ Workspace

- Original / Split / Output view
- Draggable split handle
- Checkerboard transparency
- Safe-area overlay
- Grid
- Ruler
- Zoom
- File queue พร้อมสถานะ
- Responsive layout สำหรับ desktop/tablet/mobile
- Presets
- Preset lock
- Undo/Redo ระดับ workspace
- บันทึก settings/preset ใน `localStorage`

### Quality analysis

- Local quality score 0–100
- ตรวจ ink coverage
- ตรวจขนาดลายเซ็นต่ำ
- ตรวจลายเซ็นชิดขอบ
- ตรวจ contrast ต่ำ
- แสดงคำแนะนำภาษาไทย

Quality analysis รุ่นปัจจุบันเป็น image heuristics ภายในเครื่อง ไม่ใช่โมเดล AI/ML ที่ผ่านการ train

### Export

- PNG
- JPG พร้อมกำหนด quality
- SVG wrapper ที่ฝัง PNG เมื่อผ่าน pixel processing
- Raster PDF
- ZIP สำหรับหลายไฟล์
- ป้องกันชื่อไฟล์ซ้ำภายใน ZIP

### Offline/PWA

- `manifest.webmanifest`
- Service worker สำหรับ production
- Runtime cache หลังเปิดใช้งานครั้งแรก
- ไม่มี D1 หรือ R2

## 5. ไฟล์สำคัญ

```text
C:\GitHub\signature-studio\
├─ app\
│  ├─ SignatureStudio.tsx          # UI, state, import/export, batch workflow
│  ├─ lib\signature-processing.ts # Canvas processing pipeline และ quality score
│  ├─ page.tsx                     # หน้า root
│  ├─ layout.tsx                   # Thai metadata, OG/X metadata, manifest
│  ├─ globals.css                  # Tailwind/global baseline
│  ├─ studio-v1.css                # Signature Studio UI system
│  └─ vite-env.d.ts                # Vite/PDF worker declarations
├─ public\
│  ├─ og.png                       # Social preview generated สำหรับโครงการนี้
│  ├─ manifest.webmanifest
│  └─ sw.js
├─ tests\rendered-html.test.mjs
├─ worker\index.ts
├─ build\sites-vite-plugin.ts
├─ .openai\hosting.json
├─ package.json
├─ package-lock.json
└─ README.md
```

Dependencies สำคัญ:

- React 19
- Next 16 ผ่าน vinext/Vite
- `pdfjs-dist` สำหรับ PDF import
- `jspdf` สำหรับ PDF export
- `jszip` สำหรับ batch ZIP
- Cloudflare Vite plugin / Wrangler สำหรับ Sites-compatible Worker build

## 6. Architecture decisions

- Processing ใช้ browser Canvas API เพื่อลด dependency และรักษาความเป็นส่วนตัว
- File/blob/canvas อยู่ใน memory; ไม่เก็บไฟล์ต้นฉบับใน `localStorage`
- `localStorage` ใช้เฉพาะ settings, preset และ lock state
- Full-resolution batch ทำทีละไฟล์ระหว่าง export เพื่อลด memory pressure
- PDF/SVG ที่ผ่าน pixel operation ใช้ raster pipeline
- `app/layout.tsx` สร้าง absolute OG image URL จาก request host
- `.openai/hosting.json` มีค่า:

```json
{
  "d1": null,
  "r2": null
}
```

## 7. ข้อจำกัดปัจจุบัน

- “AI Signature Detection/Removal” ยังเป็น local heuristics ไม่ใช่ ONNX/Transformers model
- ยังไม่มี manual crop/path editing ระดับ vector
- SVG ที่ผ่าน filter จะไม่คง vector ล้วน
- PDF export เป็น raster PDF
- Undo/Redo เป็น settings history ระดับ workspace ไม่ใช่ per-file full history
- ยังไม่มี mini navigator และ live histogram แบบเต็ม
- ยังไม่มี Web Worker/OffscreenCanvas สำหรับงานภาพหนัก
- Batch 200 ไฟล์รองรับเชิง workflow แต่ภาพความละเอียดสูงจำนวนมากยังควรทดสอบ memory เพิ่ม
- ยังไม่ได้ทำ browser UI automation/visual regression test
- GitHub repository มี source code แล้ว แต่ยังไม่ใช่ GitHub Pages deployment

## 8. ปัญหาที่พบและวิธีแก้

### Windows npm scripts

Starter เดิมใช้ POSIX environment prefix:

```text
WRANGLER_LOG_PATH=.wrangler/wrangler.log vinext dev
```

บน Windows ล้มด้วย:

```text
'WRANGLER_LOG_PATH' is not recognized as an internal or external command
```

แก้ package scripts เป็น cross-platform:

```json
"dev": "vinext dev",
"build": "vinext build",
"start": "vinext start"
```

### Sandbox `spawn EPERM`

Vite/Vinext ต้องเรียก Windows subprocess บางส่วน จึงเคยพบ:

```text
Error: spawn EPERM
```

เมื่อรันผ่าน Codex อาจต้องใช้ execution นอก sandbox สำหรับ dev/build/test ที่สร้าง subprocess

### ย้ายโครงการแล้วถูกล็อก

การย้ายจาก:

`C:\Users\noppadol.s\OneDrive - 1-TO-ALL Co., Ltd\Desktop\Signature\Resize`

ไป:

`C:\GitHub\signature-studio`

ล้มครั้งแรกด้วย:

```text
The process cannot access the file because it is being used by another process.
```

สาเหตุคือมี `vinext` และ `workerd` preview processes หลายชุดที่ยังอ้างถึง path เดิม หลังหยุดเฉพาะ process เหล่านั้น การย้ายสำเร็จ และยืนยัน Git root ใหม่แล้ว

ไฟล์ลายเซ็นต้นฉบับที่อยู่นอกโฟลเดอร์ `Resize` ยังคงอยู่ที่ Desktop เดิมและไม่ได้ถูกย้ายเข้า repository

### Localhost verification

Vinext bind ที่ IPv6 loopback (`::1:5173`) แม้ command จะระบุ `--host 127.0.0.1` ใน environment นี้

- Log แสดง `http://localhost:5173/`
- `curl.exe --noproxy '*' http://localhost:5173/` ได้ HTTP 200 และพบข้อความ Signature Studio
- `Invoke-WebRequest` และ `Test-NetConnection` เคยรายงานเชื่อมต่อไม่ได้ แม้ socket และ `curl` ยืนยันว่า server ทำงานอยู่

เมื่อวินิจฉัยสถานะ server ให้ใช้ log + process tree + socket + `curl --noproxy` ร่วมกัน ไม่ควรตัดสินจาก `Invoke-WebRequest` อย่างเดียว

### Sites deployment

เคยพยายามสร้าง private Sites project แต่ connector ตอบ:

```text
Mcp error: -32603: Internal error
```

ตรวจ `list_sites` แล้วไม่มี site ถูกสร้าง และ `.openai/hosting.json` ไม่มี `project_id`

หากต้องการ deploy ด้วย Sites ให้ลอง `create_site` ใหม่ใน chat ใหม่เมื่อ connector พร้อม จากนั้นจึง push exact source, package, save version และ deploy private

## 9. สถานะ server ปัจจุบัน

ตรวจล่าสุดใน session นี้:

```text
URL:    http://localhost:5173/
Status: HTTP 200 และพบ Signature Studio
Path:   C:\GitHub\signature-studio
```

โปรเซสหลัก ณ เวลาตรวจ:

```text
node.exe    PID 29988  vinext dev
workerd.exe PID 27008  Cloudflare local worker
```

PID เปลี่ยนได้ หากเปิด server ใหม่ อย่า hard-code PID ใน automation

หาก server หยุด ให้รันคำสั่งในหัวข้อ “วิธีเปิดใช้งาน” ใหม่

## 10. การเผยแพร่บน GitHub

Repository และ `origin/main` ตรงกันแล้ว แต่ GitHub ไม่ได้ “run” Worker application ให้เอง

ทางเลือก:

1. **Sites/Cloudflare-compatible deployment** — เหมาะกับโครงสร้าง vinext ปัจจุบันที่สุด
2. **GitHub Actions → Cloudflare Worker** — เพิ่ม CI/CD และ secrets ที่จำเป็น
3. **GitHub Pages** — ต้องปรับเป็น static export และตรวจว่าฟีเจอร์/metadata/runtime ทั้งหมดทำงานโดยไม่พึ่ง Worker ก่อน

อย่าถือว่าการ push ขึ้น GitHub เท่ากับมี production URL

## 11. งานต่อที่แนะนำ

ลำดับที่เหมาะสม:

1. ตัดสินใจ deployment target: Sites, Cloudflare ผ่าน GitHub Actions หรือ GitHub Pages
2. ทำ browser QA กับไฟล์ PNG/JPG/SVG/PDF จริง
3. เพิ่ม tests สำหรับ background removal, crop bounds, rotation และ export dimensions
4. ย้าย processing ไป Web Worker/OffscreenCanvas สำหรับ batch ใหญ่
5. เพิ่ม manual crop/position controls และ per-file history
6. เพิ่ม ONNX/Transformers model เฉพาะเมื่อมี model, accuracy target และ fallback ที่ชัดเจน
7. ทดสอบ Safari และ mobile memory limits

## 12. Prompt สำหรับเริ่ม chat ใหม่

คัดลอกข้อความนี้ไปใช้ได้ทันที:

```text
ทำงานต่อในโครงการ C:\GitHub\signature-studio

ให้อ่าน SESSION_HANDOFF.md และ README.md ก่อนดำเนินการ จากนั้นตรวจ:
1. git status -sb
2. git rev-parse --show-toplevel
3. package.json และ .openai/hosting.json
4. สถานะ http://localhost:5173/ โดยใช้ curl.exe --noproxy '*'

รักษาหลัก browser-only/offline-first และห้ามอัปโหลดไฟล์ลายเซ็นออกจากอุปกรณ์

เป้าหมายถัดไป: <ใส่สิ่งที่ต้องการทำต่อ>
```

## 13. Success criteria สำหรับงานถัดไป

ก่อนปิดงานใน chat ใหม่ ควรยืนยันอย่างน้อย:

- `git status` ไม่มีการเปลี่ยนแปลงที่ไม่เกี่ยวข้อง
- TypeScript ผ่าน
- lint ผ่าน
- production build ผ่าน
- tests ที่เกี่ยวข้องผ่าน
- หากเปลี่ยน processing ให้พรีวิวและ export ใช้ pipeline เดียวกัน
- หาก deploy ต้องรายงาน URL จริงและ access level ชัดเจน
- หากยัง deploy ไม่ได้ ให้รายงาน blocker โดยไม่อ้างว่า GitHub repository คือ production website
