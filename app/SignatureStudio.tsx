/* eslint-disable react-hooks/set-state-in-effect, react-hooks/refs, @next/next/no-img-element */
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  canvasToBlob,
  loadImageSource,
  processSignature,
  type QualityReport,
  type Settings,
} from "./lib/signature-processing";

type AssetKind = "png" | "jpg" | "svg" | "pdf";
type AssetStatus = "ready" | "warning" | "error" | "processing";
type ViewMode = "original" | "split" | "output";
type ExportFormat = "png" | "jpg" | "svg" | "pdf";

interface SignatureAsset {
  id: string;
  name: string;
  file: File;
  kind: AssetKind;
  sourceUrl: string;
  width: number;
  height: number;
  status: AssetStatus;
  error?: string;
  pdfPage?: number;
  pdfPages?: number;
}

interface Preset {
  id: string;
  name: string;
  note: string;
  values: Partial<Settings>;
}

const MAX_FILES = 200;
const MAX_DIMENSION = 5_000;
const STORAGE_KEY = "signature-studio-preferences-v1";

const DEFAULT_SETTINGS: Settings = {
  outputWidth: 900,
  outputHeight: 300,
  targetHeight: 160,
  margin: 32,
  removal: 30,
  feather: 18,
  contrast: 12,
  grayscale: false,
  autoCrop: true,
  rotation: 0,
  flipX: false,
  flipY: false,
  background: "transparent",
  alignX: "center",
  alignY: "center",
};

const PRESETS: Preset[] = [
  {
    id: "company",
    name: "มาตรฐานบริษัท",
    note: "900 × 300 px · ลายเซ็นสูง 160 px",
    values: DEFAULT_SETTINGS,
  },
  {
    id: "compact",
    name: "เอกสารขนาดกะทัดรัด",
    note: "720 × 240 px · ลายเซ็นสูง 124 px",
    values: {
      outputWidth: 720,
      outputHeight: 240,
      targetHeight: 124,
      margin: 28,
    },
  },
  {
    id: "high-resolution",
    name: "ความละเอียดสูง",
    note: "1,800 × 600 px · ลายเซ็นสูง 320 px",
    values: {
      outputWidth: 1800,
      outputHeight: 600,
      targetHeight: 320,
      margin: 64,
    },
  },
];

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatKind(kind: AssetKind): string {
  return kind === "jpg" ? "JPG" : kind.toUpperCase();
}

function baseName(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

function safeFilename(filename: string): string {
  return filename
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "signature";
}

function detectKind(file: File): AssetKind | null {
  const lower = file.name.toLowerCase();
  if (file.type === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
  if (file.type === "image/svg+xml" || lower.endsWith(".svg")) return "svg";
  if (file.type === "image/png" || lower.endsWith(".png")) return "png";
  if (
    file.type === "image/jpeg" ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg")
  ) {
    return "jpg";
  }
  return null;
}

function qualityLabel(label: QualityReport["label"]): string {
  const labels: Record<QualityReport["label"], string> = {
    Excellent: "ดีเยี่ยม",
    Good: "ดี",
    Fair: "พอใช้",
    "Needs attention": "ควรตรวจสอบ",
  };
  return labels[label];
}

function translateAdvice(message: string): string {
  const translations: Record<string, string> = {
    "No visible signature ink was detected.": "ไม่พบเส้นลายเซ็นที่มองเห็นได้",
    "Reduce background removal or use an image with a darker signature.":
      "ลดค่าลบพื้นหลัง หรือใช้ต้นฉบับที่ลายเซ็นเข้มขึ้น",
    "The signature occupies very little of the output area.":
      "ลายเซ็นใช้พื้นที่ในภาพผลลัพธ์น้อยเกินไป",
    "Increase the target height or crop closer to the ink.":
      "เพิ่มความสูงเป้าหมายหรือครอบให้ชิดเส้นมากขึ้น",
    "The signature may appear too small in documents.":
      "ลายเซ็นอาจดูเล็กเกินไปเมื่อนำไปใช้ในเอกสาร",
    "Increase the target height for better legibility.":
      "เพิ่มความสูงเป้าหมายเพื่อให้อ่านรูปทรงได้ชัดขึ้น",
    "Ink coverage is unusually high.": "พื้นที่เส้นหมึกสูงผิดปกติ",
    "Check the background-removal threshold and crop bounds.":
      "ตรวจค่าลบพื้นหลังและขอบเขตการครอบตัด",
    "The visible signature has low pixel dimensions.":
      "ลายเซ็นต้นฉบับมีความละเอียดค่อนข้างต่ำ",
    "Use a higher-resolution source image when available.":
      "หากเป็นไปได้ ควรใช้ไฟล์ต้นฉบับที่ความละเอียดสูงกว่า",
    "The signature is touching an output edge and may be clipped.":
      "ลายเซ็นชิดขอบและอาจถูกตัด",
    "Add margin or reduce the target height.":
      "เพิ่มระยะขอบหรือลดความสูงเป้าหมาย",
    "The signature has weak contrast against a light background.":
      "ลายเซ็นมีความต่างระดับสีกับพื้นหลังน้อย",
    "Increase contrast or use a darker source image.":
      "เพิ่มความคมชัดหรือใช้ต้นฉบับที่เข้มกว่า",
  };
  return translations[message] ?? message;
}

async function renderPdfPage(
  file: File,
  requestedPage: number,
): Promise<{ sourceUrl: string; width: number; height: number; pages: number }> {
  const pdfjs = await import("pdfjs-dist");
  const workerModule = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });
  const pdfDocument = await loadingTask.promise;
  const pageNumber = Math.min(Math.max(1, requestedPage), pdfDocument.numPages);
  const page = await pdfDocument.getPage(pageNumber);
  const unscaled = page.getViewport({ scale: 1 });
  const scale = Math.min(2, MAX_DIMENSION / Math.max(unscaled.width, unscaled.height));
  const viewport = page.getViewport({ scale });
  const canvas = window.document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("เบราว์เซอร์ไม่สามารถเปิดหน้าจาก PDF ได้");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  const sourceUrl = canvas.toDataURL("image/png");
  page.cleanup();
  const pageCount = pdfDocument.numPages;
  await loadingTask.destroy();
  return {
    sourceUrl,
    width: canvas.width,
    height: canvas.height,
    pages: pageCount,
  };
}

async function createAsset(file: File): Promise<SignatureAsset> {
  const kind = detectKind(file);
  if (!kind) throw new Error("รองรับเฉพาะ PNG, JPG, SVG และ PDF");

  if (kind === "pdf") {
    const rendered = await renderPdfPage(file, 1);
    return {
      id: makeId(),
      name: file.name,
      file,
      kind,
      sourceUrl: rendered.sourceUrl,
      width: rendered.width,
      height: rendered.height,
      status: "ready",
      pdfPage: 1,
      pdfPages: rendered.pages,
    };
  }

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageSource(sourceUrl);
    if (image.naturalWidth > MAX_DIMENSION || image.naturalHeight > MAX_DIMENSION) {
      throw new Error(
        `ภาพมีขนาด ${image.naturalWidth.toLocaleString()} × ${image.naturalHeight.toLocaleString()} px ซึ่งเกิน 5,000 × 5,000 px`,
      );
    }
    return {
      id: makeId(),
      name: file.name,
      file,
      kind,
      sourceUrl,
      width: image.naturalWidth,
      height: image.naturalHeight,
      status: "ready",
    };
  } catch (error) {
    URL.revokeObjectURL(sourceUrl);
    throw error;
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export default function SignatureStudio() {
  const [assets, setAssets] = useState<SignatureAsset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [presetId, setPresetId] = useState("company");
  const [presetLocked, setPresetLocked] = useState(false);
  const [quality, setQuality] = useState<QualityReport | null>(null);
  const [processing, setProcessing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("png");
  const [jpgQuality, setJpgQuality] = useState(92);
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [splitPosition, setSplitPosition] = useState(50);
  const [zoom, setZoom] = useState(100);
  const [showGrid, setShowGrid] = useState(false);
  const [showRuler, setShowRuler] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [notice, setNotice] = useState("พร้อมใช้งานแบบออฟไลน์");
  const [queueOpen, setQueueOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const outputCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const undoStack = useRef<Settings[]>([]);
  const redoStack = useRef<Settings[]>([]);
  const objectUrls = useRef<Set<string>>(new Set());
  const processingGeneration = useRef(0);

  const selected = useMemo(
    () => assets.find((asset) => asset.id === selectedId) ?? assets[0] ?? null,
    [assets, selectedId],
  );

  const commitSettings = useCallback(
    (patch: Partial<Settings>, announce?: string) => {
      undoStack.current = [...undoStack.current.slice(-39), settings];
      redoStack.current = [];
      setSettings((current) => ({ ...current, ...patch }));
      setPresetId("custom");
      if (announce) setNotice(announce);
      setHistoryVersion((version) => version + 1);
    },
    [settings],
  );

  const undo = useCallback(() => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push(settings);
    setSettings(previous);
    setPresetId("custom");
    setNotice("ย้อนกลับการปรับล่าสุดแล้ว");
    setHistoryVersion((version) => version + 1);
  }, [settings]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(settings);
    setSettings(next);
    setPresetId("custom");
    setNotice("ทำซ้ำการปรับแล้ว");
    setHistoryVersion((version) => version + 1);
  }, [settings]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as {
        settings?: Partial<Settings>;
        presetId?: string;
        presetLocked?: boolean;
      };
      if (parsed.settings) setSettings({ ...DEFAULT_SETTINGS, ...parsed.settings });
      if (parsed.presetId) setPresetId(parsed.presetId);
      if (typeof parsed.presetLocked === "boolean") setPresetLocked(parsed.presetLocked);
    } catch {
      setNotice("เปิดค่าที่บันทึกไว้ไม่ได้ จึงใช้ค่ามาตรฐาน");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ settings, presetId, presetLocked }),
    );
  }, [settings, presetId, presetLocked]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  const ingestFiles = useCallback(
    async (incoming: FileList | File[]) => {
      const files = Array.from(incoming);
      if (!files.length) return;
      const room = MAX_FILES - assets.length;
      if (room <= 0) {
        setNotice("รายการเต็มแล้ว (สูงสุด 200 ไฟล์)");
        return;
      }
      const accepted = files.slice(0, room);
      setImporting(true);
      setNotice(`กำลังอ่าน ${accepted.length} ไฟล์บนอุปกรณ์นี้…`);
      const created: SignatureAsset[] = [];
      const failures: string[] = [];
      for (const file of accepted) {
        try {
          const asset = await createAsset(file);
          if (asset.sourceUrl.startsWith("blob:")) objectUrls.current.add(asset.sourceUrl);
          created.push(asset);
        } catch (error) {
          failures.push(`${file.name}: ${error instanceof Error ? error.message : "เปิดไฟล์ไม่ได้"}`);
        }
      }
      setAssets((current) => [...current, ...created]);
      if (!selectedId && created[0]) setSelectedId(created[0].id);
      setImporting(false);
      if (failures.length) {
        setNotice(`เพิ่มสำเร็จ ${created.length} ไฟล์ · ข้าม ${failures.length} ไฟล์`);
      } else {
        setNotice(`เพิ่มแล้ว ${created.length} ไฟล์ · ไม่มีการอัปโหลดออกจากเครื่อง`);
      }
    },
    [assets.length, selectedId],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.matches("input, textarea, select, [contenteditable='true']") ||
        !event.clipboardData?.files.length
      ) {
        return;
      }
      event.preventDefault();
      void ingestFiles(event.clipboardData.files);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === "o") {
        event.preventDefault();
        inputRef.current?.click();
      }
      if (command && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      }
      if (command && event.key.toLowerCase() === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
      }
      if (!command && event.key === "0") setZoom(100);
      if (!command && (event.key === "+" || event.key === "=")) {
        setZoom((value) => Math.min(200, value + 10));
      }
      if (!command && event.key === "-") {
        setZoom((value) => Math.max(50, value - 10));
      }
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [ingestFiles, redo, undo]);

  useEffect(() => {
    if (!selected) {
      setQuality(null);
      return;
    }
    const generation = ++processingGeneration.current;
    const timer = window.setTimeout(() => {
      setProcessing(true);
      void processSignature(selected.sourceUrl, settings)
        .then((result) => {
          if (generation !== processingGeneration.current) return;
          const canvas = outputCanvasRef.current;
          if (canvas) {
            canvas.width = result.canvas.width;
            canvas.height = result.canvas.height;
            canvas.getContext("2d")?.drawImage(result.canvas, 0, 0);
          }
          setQuality(result.quality);
          setAssets((current) =>
            current.map((asset) =>
              asset.id === selected.id
                ? {
                    ...asset,
                    status: result.quality.score >= 60 ? "ready" : "warning",
                  }
                : asset,
            ),
          );
        })
        .catch((error) => {
          if (generation !== processingGeneration.current) return;
          setNotice(error instanceof Error ? error.message : "ประมวลผลภาพไม่สำเร็จ");
          setQuality(null);
        })
        .finally(() => {
          if (generation === processingGeneration.current) setProcessing(false);
        });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [selected, settings]);

  const removeAsset = useCallback(
    (id: string) => {
      const target = assets.find((asset) => asset.id === id);
      if (target?.sourceUrl.startsWith("blob:")) {
        URL.revokeObjectURL(target.sourceUrl);
        objectUrls.current.delete(target.sourceUrl);
      }
      const next = assets.filter((asset) => asset.id !== id);
      setAssets(next);
      if (selectedId === id) setSelectedId(next[0]?.id ?? null);
      setNotice("นำไฟล์ออกจากพื้นที่ทำงานแล้ว");
    },
    [assets, selectedId],
  );

  const clearAssets = useCallback(() => {
    if (assets.length > 1 && !window.confirm(`นำไฟล์ทั้ง ${assets.length} รายการออกหรือไม่`)) return;
    for (const asset of assets) {
      if (asset.sourceUrl.startsWith("blob:")) URL.revokeObjectURL(asset.sourceUrl);
    }
    objectUrls.current.clear();
    setAssets([]);
    setSelectedId(null);
    setNotice("ล้างพื้นที่ทำงานแล้ว");
  }, [assets]);

  const changePdfPage = useCallback(
    async (asset: SignatureAsset, pageNumber: number) => {
      setAssets((current) =>
        current.map((item) =>
          item.id === asset.id ? { ...item, status: "processing" } : item,
        ),
      );
      try {
        const rendered = await renderPdfPage(asset.file, pageNumber);
        setAssets((current) =>
          current.map((item) =>
            item.id === asset.id
              ? {
                  ...item,
                  sourceUrl: rendered.sourceUrl,
                  width: rendered.width,
                  height: rendered.height,
                  pdfPage: pageNumber,
                  pdfPages: rendered.pages,
                  status: "ready",
                }
              : item,
          ),
        );
        setNotice(`เปิดหน้า ${pageNumber} จาก PDF แล้ว`);
      } catch {
        setAssets((current) =>
          current.map((item) =>
            item.id === asset.id ? { ...item, status: "error" } : item,
          ),
        );
        setNotice("เปิดหน้าที่เลือกจาก PDF ไม่สำเร็จ");
      }
    },
    [],
  );

  const applyPreset = useCallback(
    (id: string) => {
      const preset = PRESETS.find((item) => item.id === id);
      if (!preset) return;
      undoStack.current = [...undoStack.current.slice(-39), settings];
      redoStack.current = [];
      setSettings({ ...DEFAULT_SETTINGS, ...preset.values });
      setPresetId(id);
      setNotice(`ใช้พรีเซ็ต “${preset.name}” แล้ว`);
      setHistoryVersion((version) => version + 1);
    },
    [settings],
  );

  const encodeCanvas = useCallback(
    async (canvas: HTMLCanvasElement, format: ExportFormat): Promise<Blob> => {
      if (format === "png") return canvasToBlob(canvas, "image/png");
      if (format === "jpg") {
        const flattened = document.createElement("canvas");
        flattened.width = canvas.width;
        flattened.height = canvas.height;
        const context = flattened.getContext("2d");
        if (!context) throw new Error("สร้างไฟล์ JPG ไม่สำเร็จ");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, flattened.width, flattened.height);
        context.drawImage(canvas, 0, 0);
        return canvasToBlob(flattened, "image/jpeg", jpgQuality / 100);
      }
      if (format === "svg") {
        const png = canvas.toDataURL("image/png");
        const markup = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}"><image width="100%" height="100%" href="${png}"/></svg>`;
        return new Blob([markup], { type: "image/svg+xml" });
      }
      const { jsPDF } = await import("jspdf");
      const orientation = canvas.width >= canvas.height ? "landscape" : "portrait";
      const pdf = new jsPDF({
        orientation,
        unit: "px",
        format: [canvas.width, canvas.height],
        compress: true,
      });
      const whiteCanvas = document.createElement("canvas");
      whiteCanvas.width = canvas.width;
      whiteCanvas.height = canvas.height;
      const context = whiteCanvas.getContext("2d");
      if (!context) throw new Error("สร้าง PDF ไม่สำเร็จ");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, whiteCanvas.width, whiteCanvas.height);
      context.drawImage(canvas, 0, 0);
      pdf.addImage(whiteCanvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height);
      return pdf.output("blob");
    },
    [jpgQuality],
  );

  const exportOne = useCallback(async () => {
    if (!selected) return;
    setExporting(true);
    setNotice(`กำลังเตรียม ${selected.name}…`);
    try {
      const renderSettings =
        exportFormat === "jpg" || exportFormat === "pdf"
          ? { ...settings, background: "white" as const }
          : settings;
      const result = await processSignature(selected.sourceUrl, renderSettings);
      const blob = await encodeCanvas(result.canvas, exportFormat);
      downloadBlob(
        blob,
        `${safeFilename(baseName(selected.name))}-normalized.${exportFormat}`,
      );
      setNotice("ส่งออกไฟล์เรียบร้อยแล้ว");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "ส่งออกไฟล์ไม่สำเร็จ");
    } finally {
      setExporting(false);
    }
  }, [encodeCanvas, exportFormat, selected, settings]);

  const exportAll = useCallback(async () => {
    if (!assets.length) return;
    setExporting(true);
    setExportProgress(0);
    setNotice(`กำลังจัดเตรียม ${assets.length} ไฟล์…`);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const usedNames = new Set<string>();
      for (let index = 0; index < assets.length; index += 1) {
        const asset = assets[index];
        const renderSettings =
          exportFormat === "jpg" || exportFormat === "pdf"
            ? { ...settings, background: "white" as const }
            : settings;
        const result = await processSignature(asset.sourceUrl, renderSettings);
        const blob = await encodeCanvas(result.canvas, exportFormat);
        let filename = `${safeFilename(baseName(asset.name))}-normalized.${exportFormat}`;
        let suffix = 2;
        while (usedNames.has(filename.toLowerCase())) {
          filename = `${safeFilename(baseName(asset.name))}-normalized-${suffix}.${exportFormat}`;
          suffix += 1;
        }
        usedNames.add(filename.toLowerCase());
        zip.file(filename, blob, { compression: "STORE" });
        setExportProgress(Math.round(((index + 1) / assets.length) * 80));
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
      const blob = await zip.generateAsync(
        { type: "blob", compression: "STORE" },
        ({ percent }) => setExportProgress(80 + Math.round(percent * 0.2)),
      );
      downloadBlob(blob, `signature-studio-${new Date().toISOString().slice(0, 10)}.zip`);
      setExportProgress(100);
      setNotice(`ส่งออก ${assets.length} ไฟล์เป็น ZIP เรียบร้อยแล้ว`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "สร้าง ZIP ไม่สำเร็จ");
    } finally {
      setExporting(false);
    }
  }, [assets, encodeCanvas, exportFormat, settings]);

  const onFilesChosen = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) void ingestFiles(event.target.files);
    event.target.value = "";
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragActive(false);
    if (event.dataTransfer.files.length) void ingestFiles(event.dataTransfer.files);
  };

  const updateSplitFromPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const container = previewRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const move = (pointerEvent: PointerEvent) => {
      setSplitPosition(
        Math.min(82, Math.max(18, ((pointerEvent.clientX - rect.left) / rect.width) * 100)),
      );
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const currentPreset = PRESETS.find((preset) => preset.id === presetId);
  const safeAreaInset = `${Math.min(45, (settings.margin / settings.outputHeight) * 100)}%`;

  return (
    <main className="studio-shell">
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept=".png,.jpg,.jpeg,.svg,.pdf,image/png,image/jpeg,image/svg+xml,application/pdf"
        multiple
        onChange={onFilesChosen}
      />

      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">S</span>
          <div>
            <strong>Signature Studio</strong>
            <span>มาตรฐานลายเซ็นองค์กร</span>
          </div>
        </div>

        <div className="privacy-pill" title="ไฟล์ทั้งหมดอยู่บนอุปกรณ์นี้">
          <span className="privacy-dot" aria-hidden="true" />
          ประมวลผลบนอุปกรณ์นี้
        </div>

        <div className="topbar-actions">
          <button
            className="icon-button"
            type="button"
            onClick={undo}
            disabled={!undoStack.current.length}
            aria-label="ย้อนกลับ"
            title="ย้อนกลับ (Ctrl+Z)"
          >
            ↶
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={redo}
            disabled={!redoStack.current.length}
            aria-label="ทำซ้ำ"
            title="ทำซ้ำ (Ctrl+Shift+Z)"
          >
            ↷
          </button>
          <span className="history-count" aria-label={`ประวัติ ${undoStack.current.length} รายการ`}>
            {historyVersion ? `${undoStack.current.length} การปรับ` : "ยังไม่มีประวัติ"}
          </span>
          <button className="secondary-button mobile-only" type="button" onClick={() => setQueueOpen(true)}>
            รายการ {assets.length ? `(${assets.length})` : ""}
          </button>
          <button className="secondary-button mobile-only" type="button" onClick={() => setInspectorOpen(true)}>
            ตั้งค่า
          </button>
          <button className="secondary-button" type="button" onClick={() => inputRef.current?.click()}>
            <span aria-hidden="true">＋</span> เพิ่มไฟล์
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => void (assets.length > 1 ? exportAll() : exportOne())}
            disabled={!assets.length || exporting}
          >
            {exporting ? `กำลังส่งออก ${exportProgress ? `${exportProgress}%` : "…"}` : assets.length > 1 ? `ส่งออก ${assets.length} ไฟล์` : "ส่งออก"}
          </button>
        </div>
      </header>

      <div className="studio-body">
        <aside className={`queue-panel ${queueOpen ? "mobile-open" : ""}`} aria-label="รายการไฟล์">
          <div className="panel-heading">
            <div>
              <h2>รายการไฟล์</h2>
              <p>{assets.length} / {MAX_FILES} ไฟล์</p>
            </div>
            <button className="icon-button mobile-close" type="button" onClick={() => setQueueOpen(false)} aria-label="ปิดรายการไฟล์">×</button>
            {assets.length > 0 && (
              <button className="text-button desktop-only" type="button" onClick={clearAssets}>ล้างทั้งหมด</button>
            )}
          </div>

          <button className="add-file-card" type="button" onClick={() => inputRef.current?.click()}>
            <span className="add-icon" aria-hidden="true">＋</span>
            <span><strong>เพิ่มลายเซ็น</strong><small>PNG · JPG · SVG · PDF</small></span>
          </button>

          <div className="queue-list">
            {assets.map((asset, index) => (
              <article
                key={asset.id}
                className={`queue-item ${selected?.id === asset.id ? "selected" : ""}`}
                onClick={() => {
                  setSelectedId(asset.id);
                  setQueueOpen(false);
                }}
              >
                <button className="queue-select" type="button" aria-label={`เลือก ${asset.name}`}>
                  <span className="queue-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="queue-thumb checkerboard"><img src={asset.sourceUrl} alt="" /></span>
                  <span className="queue-copy">
                    <strong title={asset.name}>{asset.name}</strong>
                    <small>{formatKind(asset.kind)} · {asset.width} × {asset.height}</small>
                    <span className={`status-line ${asset.status}`}>
                      <span aria-hidden="true" />
                      {asset.status === "processing" ? "กำลังประมวลผล" : asset.status === "warning" ? "ควรตรวจสอบ" : asset.status === "error" ? "เปิดไม่ได้" : "พร้อมส่งออก"}
                    </span>
                  </span>
                </button>
                <button
                  className="remove-file"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeAsset(asset.id);
                  }}
                  aria-label={`นำ ${asset.name} ออก`}
                  title="นำออก"
                >
                  ×
                </button>
              </article>
            ))}
          </div>

          {!assets.length && (
            <div className="queue-empty">
              <span aria-hidden="true">◎</span>
              <p>ไฟล์ที่เพิ่มจะปรากฏที่นี่</p>
            </div>
          )}

          <div className="queue-footer">
            <span className="privacy-dot" aria-hidden="true" />
            <p><strong>Local workspace</strong><br />ไม่บันทึกหรือส่งไฟล์ต้นฉบับออกจากเครื่อง</p>
          </div>
        </aside>

        <section
          className={`workspace ${dragActive ? "drag-active" : ""}`}
          onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragActive(false);
          }}
          onDrop={onDrop}
        >
          {selected ? (
            <>
              <div className="workspace-toolbar">
                <div className="file-heading">
                  <span className={`file-status ${processing ? "processing" : quality && quality.score < 60 ? "warning" : "ready"}`} aria-hidden="true" />
                  <div>
                    <strong>{selected.name}</strong>
                    <span>{formatKind(selected.kind)} · {formatBytes(selected.file.size)} · {selected.width} × {selected.height} px</span>
                  </div>
                </div>
                <div className="segmented-control" aria-label="โหมดพรีวิว">
                  {(["original", "split", "output"] as ViewMode[]).map((mode) => (
                    <button key={mode} type="button" className={viewMode === mode ? "active" : ""} onClick={() => setViewMode(mode)}>
                      {mode === "original" ? "ต้นฉบับ" : mode === "split" ? "เปรียบเทียบ" : "ผลลัพธ์"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="preview-viewport" ref={previewRef}>
                <div className="ruler ruler-horizontal" aria-hidden={!showRuler} data-visible={showRuler} />
                <div className="ruler ruler-vertical" aria-hidden={!showRuler} data-visible={showRuler} />
                <div className="preview-stage" style={{ transform: `scale(${zoom / 100})` }}>
                  {(viewMode === "original" || viewMode === "split") && (
                    <div
                      className="preview-pane original-pane"
                      style={viewMode === "split" ? { width: `${splitPosition}%` } : undefined}
                    >
                      <div className="pane-label">ต้นฉบับ</div>
                      <img src={selected.sourceUrl} alt={`ลายเซ็นต้นฉบับ ${selected.name}`} />
                    </div>
                  )}
                  {(viewMode === "output" || viewMode === "split") && (
                    <div
                      className={`preview-pane output-pane ${settings.background === "transparent" ? "checkerboard" : "white-background"}`}
                      style={viewMode === "split" ? { left: `${splitPosition}%` } : undefined}
                    >
                      <div className="pane-label">ผลลัพธ์</div>
                      <canvas ref={outputCanvasRef} aria-label={`ผลลัพธ์ ${settings.outputWidth} คูณ ${settings.outputHeight} พิกเซล`} />
                      <div className="safe-area" style={{ inset: safeAreaInset }} aria-hidden="true" />
                    </div>
                  )}
                  {showGrid && <div className="grid-overlay" aria-hidden="true" />}
                  {viewMode === "split" && (
                    <button
                      className="split-handle"
                      type="button"
                      style={{ left: `${splitPosition}%` }}
                      onPointerDown={updateSplitFromPointer}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowLeft") setSplitPosition((value) => Math.max(18, value - 2));
                        if (event.key === "ArrowRight") setSplitPosition((value) => Math.min(82, value + 2));
                      }}
                      role="slider"
                      aria-label="สัดส่วนการเปรียบเทียบ"
                      aria-valuemin={18}
                      aria-valuemax={82}
                      aria-valuenow={Math.round(splitPosition)}
                      aria-valuetext={`แสดงต้นฉบับ ${Math.round(splitPosition)} เปอร์เซ็นต์`}
                    >
                      <span aria-hidden="true">↔</span>
                    </button>
                  )}
                  {processing && <div className="processing-overlay"><span /> กำลังคำนวณผลลัพธ์…</div>}
                </div>
              </div>

              <div className="canvas-toolbar">
                <button className={showGrid ? "active" : ""} type="button" onClick={() => setShowGrid((value) => !value)}>▦ กริด</button>
                <button className={showRuler ? "active" : ""} type="button" onClick={() => setShowRuler((value) => !value)}>⌜ ไม้บรรทัด</button>
                <span className="toolbar-separator" />
                <button type="button" onClick={() => setZoom((value) => Math.max(50, value - 10))} aria-label="ย่อ">−</button>
                <label className="zoom-control">
                  <span className="visually-hidden">ซูม</span>
                  <input type="range" min="50" max="200" step="10" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
                  <output>{zoom}%</output>
                </label>
                <button type="button" onClick={() => setZoom((value) => Math.min(200, value + 10))} aria-label="ขยาย">＋</button>
                <button type="button" onClick={() => setZoom(100)}>พอดี</button>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-visual" aria-hidden="true">
                <span className="paper-card paper-back" />
                <span className="paper-card paper-front"><i /></span>
                <span className="upload-badge">↑</span>
              </div>
              <p className="eyebrow">SIGNATURE NORMALIZATION</p>
              <h1>วางไฟล์ลายเซ็นที่นี่</h1>
              <p className="empty-copy">ปรับขนาด ตำแหน่ง พื้นหลัง และคุณภาพให้เป็นมาตรฐานเดียวกัน โดยไฟล์ไม่ออกจากอุปกรณ์ของคุณ</p>
              <button className="primary-button large" type="button" onClick={() => inputRef.current?.click()} disabled={importing}>
                {importing ? "กำลังอ่านไฟล์…" : "เลือกไฟล์จากเครื่อง"}
              </button>
              <span className="drop-hint">หรือ ลากและวาง · วางด้วย Ctrl+V</span>
              <div className="format-chips" aria-label="รูปแบบที่รองรับ">
                <span>PNG</span><span>JPG</span><span>SVG</span><span>PDF</span>
              </div>
              <div className="privacy-note"><span className="privacy-dot" aria-hidden="true" /> ประมวลผลในเบราว์เซอร์ · สูงสุด 5,000 × 5,000 px · Batch 200 ไฟล์</div>
            </div>
          )}

          {dragActive && (
            <div className="drop-overlay">
              <span aria-hidden="true">↓</span>
              <strong>ปล่อยไฟล์เพื่อเพิ่มในพื้นที่ทำงาน</strong>
              <small>ไฟล์จะประมวลผลบนอุปกรณ์นี้เท่านั้น</small>
            </div>
          )}
        </section>

        <aside className={`inspector-panel ${inspectorOpen ? "mobile-open" : ""}`} aria-label="การตั้งค่า">
          <div className="panel-heading inspector-heading">
            <div><h2>การตั้งค่า</h2><p>ใช้กับทุกไฟล์ในรายการ</p></div>
            <button className="icon-button mobile-close" type="button" onClick={() => setInspectorOpen(false)} aria-label="ปิดการตั้งค่า">×</button>
          </div>

          <div className="inspector-scroll">
            <section className="setting-section">
              <div className="section-title-row">
                <div><span className="section-kicker">PRESET</span><h3>ค่ามาตรฐาน</h3></div>
                <button
                  className={`lock-button ${presetLocked ? "locked" : ""}`}
                  type="button"
                  onClick={() => setPresetLocked((value) => !value)}
                  aria-pressed={presetLocked}
                >
                  {presetLocked ? "● ล็อกอยู่" : "○ ปลดล็อก"}
                </button>
              </div>
              <label className="field-label">
                <span>พรีเซ็ต</span>
                <select value={presetId} onChange={(event) => applyPreset(event.target.value)}>
                  {presetId === "custom" && <option value="custom">กำหนดเอง</option>}
                  {PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                </select>
                <small>{currentPreset?.note ?? "ค่าที่ปรับเองจะบันทึกในเบราว์เซอร์"}</small>
              </label>
              {presetLocked && <div className="locked-note">ค่าหลักถูกล็อกตามมาตรฐานบริษัท ปลดล็อกเพื่อแก้ไข</div>}

              <div className="two-column-fields">
                <label className="field-label"><span>ความกว้าง <small>px</small></span><input type="number" min="120" max="5000" value={settings.outputWidth} disabled={presetLocked} onChange={(event) => commitSettings({ outputWidth: Number(event.target.value) })} /></label>
                <label className="field-label"><span>ความสูง <small>px</small></span><input type="number" min="80" max="5000" value={settings.outputHeight} disabled={presetLocked} onChange={(event) => commitSettings({ outputHeight: Number(event.target.value) })} /></label>
              </div>
              <RangeField label="ความสูงลายเซ็น" value={settings.targetHeight} min={20} max={Math.max(40, settings.outputHeight - settings.margin * 2)} suffix="px" disabled={presetLocked} onChange={(value) => commitSettings({ targetHeight: value })} />
              <RangeField label="ระยะขอบปลอดภัย" value={settings.margin} min={0} max={Math.floor(Math.min(settings.outputWidth, settings.outputHeight) / 3)} suffix="px" disabled={presetLocked} onChange={(value) => commitSettings({ margin: value })} />

              <div className="alignment-field">
                <span>ตำแหน่งลายเซ็น</span>
                <div className="alignment-grid" role="group" aria-label="ตำแหน่งลายเซ็น">
                  {(["top", "center", "bottom"] as const).flatMap((vertical) =>
                    (["left", "center", "right"] as const).map((horizontal) => (
                      <button
                        key={`${vertical}-${horizontal}`}
                        type="button"
                        className={settings.alignX === horizontal && settings.alignY === vertical ? "active" : ""}
                        onClick={() => commitSettings({ alignX: horizontal, alignY: vertical })}
                        aria-label={`${horizontal} ${vertical}`}
                        disabled={presetLocked}
                      ><span /></button>
                    )),
                  )}
                </div>
              </div>
            </section>

            <section className="setting-section">
              <div className="section-title-row"><div><span className="section-kicker">CLEANUP</span><h3>พื้นหลังและภาพ</h3></div></div>
              <ToggleField label="ครอบตัดอัตโนมัติ" note="หาเส้นลายเซ็นและตัดพื้นที่ว่าง" checked={settings.autoCrop} onChange={(checked) => commitSettings({ autoCrop: checked })} />
              <ToggleField label="แปลงเป็นขาวดำ" note="เหมาะกับเอกสารทางการ" checked={settings.grayscale} onChange={(checked) => commitSettings({ grayscale: checked })} />
              <RangeField label="ลบพื้นหลังสีขาว" value={settings.removal} min={0} max={100} suffix="" onChange={(value) => commitSettings({ removal: value })} />
              <RangeField label="ความนุ่มของขอบ" value={settings.feather} min={0} max={60} suffix="" onChange={(value) => commitSettings({ feather: value })} />
              <RangeField label="ความคมชัด" value={settings.contrast} min={-40} max={60} suffix="" onChange={(value) => commitSettings({ contrast: value })} />

              <div className="background-choice" role="group" aria-label="พื้นหลังผลลัพธ์">
                <button className={settings.background === "transparent" ? "active" : ""} type="button" onClick={() => commitSettings({ background: "transparent" })}><span className="choice-swatch checkerboard" /> โปร่งใส</button>
                <button className={settings.background === "white" ? "active" : ""} type="button" onClick={() => commitSettings({ background: "white" })}><span className="choice-swatch white-background" /> สีขาว</button>
              </div>

              <div className="transform-row" role="group" aria-label="หมุนและกลับด้าน">
                <button type="button" onClick={() => commitSettings({ rotation: (settings.rotation - 90) % 360 })}>↶ 90°</button>
                <button type="button" onClick={() => commitSettings({ rotation: (settings.rotation + 90) % 360 })}>↷ 90°</button>
                <button className={settings.flipX ? "active" : ""} type="button" onClick={() => commitSettings({ flipX: !settings.flipX })}>↔ กลับซ้ายขวา</button>
                <button className={settings.flipY ? "active" : ""} type="button" onClick={() => commitSettings({ flipY: !settings.flipY })}>↕ กลับบนล่าง</button>
              </div>
            </section>

            {selected?.kind === "pdf" && (
              <section className="setting-section">
                <div className="section-title-row"><div><span className="section-kicker">PDF</span><h3>เลือกหน้า</h3></div></div>
                <label className="field-label"><span>หน้าที่ใช้</span><select value={selected.pdfPage ?? 1} onChange={(event) => void changePdfPage(selected, Number(event.target.value))}>{Array.from({ length: selected.pdfPages ?? 1 }, (_, index) => <option key={index + 1} value={index + 1}>หน้า {index + 1}</option>)}</select></label>
              </section>
            )}

            <section className="setting-section quality-section" aria-live="polite">
              <div className="section-title-row"><div><span className="section-kicker">LOCAL ANALYSIS</span><h3>คุณภาพผลลัพธ์</h3></div></div>
              {quality ? (
                <>
                  <div className="quality-score">
                    <div className="score-ring" style={{ "--score": `${quality.score * 3.6}deg` } as CSSProperties}><span><strong>{quality.score}</strong><small>/100</small></span></div>
                    <div><strong>{qualityLabel(quality.label)}</strong><span>พื้นที่เส้นหมึก {quality.inkCoverage.toFixed(1)}%</span></div>
                  </div>
                  <div className={`quality-summary ${quality.score >= 75 ? "good" : "warning"}`}>
                    <strong>{quality.score >= 75 ? "ผ่านเกณฑ์พร้อมใช้งาน" : "แนะนำให้ตรวจสอบก่อนส่งออก"}</strong>
                    <p>{translateAdvice(quality.recommendations[0] ?? quality.warnings[0] ?? "องค์ประกอบสมดุลดี")}</p>
                  </div>
                </>
              ) : (
                <div className="quality-placeholder">{selected ? "กำลังวิเคราะห์บนอุปกรณ์นี้…" : "เพิ่มไฟล์เพื่อเริ่มวิเคราะห์"}</div>
              )}
            </section>

            <section className="setting-section export-section">
              <div className="section-title-row"><div><span className="section-kicker">EXPORT</span><h3>ส่งออก</h3></div></div>
              <label className="field-label"><span>รูปแบบไฟล์</span><select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as ExportFormat)}><option value="png">PNG — โปร่งใส คมชัด</option><option value="jpg">JPG — พื้นหลังขาว</option><option value="svg">SVG — Raster ภายใน Vector</option><option value="pdf">PDF — พร้อมแทรกเอกสาร</option></select></label>
              {exportFormat === "jpg" && <RangeField label="คุณภาพ JPG" value={jpgQuality} min={60} max={100} suffix="%" onChange={setJpgQuality} />}
              <div className="export-summary"><span>ขนาดผลลัพธ์</span><strong>{settings.outputWidth.toLocaleString()} × {settings.outputHeight.toLocaleString()} px</strong></div>
              <button className="primary-button full-width" type="button" onClick={() => void exportOne()} disabled={!selected || exporting}>{exporting ? "กำลังเตรียมไฟล์…" : "ส่งออกไฟล์ที่เลือก"}</button>
              {assets.length > 1 && <button className="secondary-button full-width" type="button" onClick={() => void exportAll()} disabled={exporting}>ดาวน์โหลด ZIP ({assets.length} ไฟล์)</button>}
            </section>
          </div>
        </aside>
      </div>

      <footer className="statusbar" role="status" aria-live="polite">
        <span className="status-ready" aria-hidden="true" />
        <span>{notice}</span>
        <span className="status-spacer" />
        <span>{assets.length ? `${assets.length} ไฟล์ในพื้นที่ทำงาน` : "Workspace ว่าง"}</span>
        <span className="status-divider" />
        <span>Browser-only · Offline-first</span>
      </footer>
    </main>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  suffix,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="range-field">
      <span className="range-heading"><span>{label}</span><output>{value}{suffix}</output></span>
      <input type="range" min={min} max={max} value={Math.min(max, Math.max(min, value))} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function ToggleField({
  label,
  note,
  checked,
  onChange,
}: {
  label: string;
  note: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-field">
      <span><strong>{label}</strong><small>{note}</small></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}






