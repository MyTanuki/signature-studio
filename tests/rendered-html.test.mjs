import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("renders the Thai Signature Studio application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html[^>]+lang="th"/i);
  assert.match(html, /<title>Signature Studio/);
  assert.match(html, /วางไฟล์ลายเซ็นที่นี่/);
  assert.match(html, /ประมวลผลบนอุปกรณ์นี้/);
  assert.match(html, /PNG/);
  assert.match(html, /PDF/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|Your site is taking shape/i);
});

test("keeps processing local and removes starter-only dependencies", async () => {
  const [page, layout, studio, processing, packageJson, hosting] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/SignatureStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/signature-processing.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /SignatureStudio/);
  assert.match(layout, /lang="th"/);
  assert.match(studio, /processSignature/);
  assert.match(studio, /localStorage/);
  assert.match(studio, /สีลายเซ็น/);
  assert.match(studio, /type="color"/);
  assert.match(studio, /INK_COLOR_PRESETS/);
  assert.match(studio, /outputWidth: 900,\s*outputHeight: 300,\s*targetHeight: 220,\s*margin: 30,/s);
  assert.match(studio, /note: "900 × 300 px · ลายเซ็นสูง 220 px"/);
  assert.match(studio, /\{ name: "น้ำเงินหมึก", value: "#1F3E98" \}/);
  assert.match(studio, /strokeWidth: 1/);
  assert.match(studio, /label="ขนาดเส้น".*min=\{0\} max=\{6\}.*strokeWidth/s);
  assert.match(studio, /settingsOverride\?: Partial<Settings>/);
  assert.match(studio, /useState<SettingsScope>\("all"\)/);
  assert.match(studio, /ทุกลายเซ็น/);
  assert.match(studio, /เฉพาะลายเซ็นนี้/);
  assert.match(studio, /processSignature\(selectedSourceUrl, selectedSettings\)/);
  assert.match(
    studio,
    /resolveSignatureSettings\(\s*settings,\s*asset\.settingsOverride,\s*\)/s,
  );
  assert.match(processing, /visibleDarkness\(red, green, blue, alpha\) \/ 255/);
  assert.match(processing, /inkColor must be a six-digit hex color/);
  assert.doesNotMatch(studio, /fetch\(["']https?:\/\//i);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.deepEqual(JSON.parse(hosting), {
    project_id: "appgprj_6a62eafa5a0c8191b0d56bc8ebcb533c",
    d1: null,
    r2: null,
  });
});

test("keeps the signature aspect ratio independent from canvas dimensions", async () => {
  const [studio, styles] = await Promise.all([
    readFile(new URL("../app/SignatureStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/studio-v1.css", import.meta.url), "utf8"),
  ]);

  assert.match(studio, /label="ขนาดลายเซ็น"/);
  assert.match(studio, /ความกว้าง Canvas.*ความสูง Canvas/s);
  assert.match(
    studio,
    /aspectRatio: `\$\{selectedSettings\.outputWidth\} \/ \$\{selectedSettings\.outputHeight\}`/,
  );
  assert.match(
    studio,
    /clipPath: `inset\(0 \$\{100 - splitPosition\}% 0 0\)`/,
  );
  assert.doesNotMatch(studio, /style=\{viewMode === "split" \? \{ left:/);
  assert.doesNotMatch(styles, /\.preview-stage[^}]*aspect-ratio:\s*3\s*\/\s*1/s);
});

test("keeps signature size fixed until the size slider changes", async () => {
  const {
    calculateSignaturePlacement,
  } = await import(
    new URL("../app/lib/signature-processing.ts", import.meta.url).href,
  );

  const baseSettings = {
    targetHeight: 160,
    margin: 32,
    alignX: "center",
    alignY: "center",
  };

  const compactCanvas = calculateSignaturePlacement(480, 120, {
    ...baseSettings,
    outputWidth: 300,
    outputHeight: 120,
  });
  const largeCanvas = calculateSignaturePlacement(480, 120, {
    ...baseSettings,
    outputWidth: 1200,
    outputHeight: 600,
  });
  const reducedSignature = calculateSignaturePlacement(480, 120, {
    ...baseSettings,
    outputWidth: 1200,
    outputHeight: 600,
    targetHeight: 80,
  });

  assert.equal(compactCanvas.width / compactCanvas.height, 4);
  assert.equal(largeCanvas.width / largeCanvas.height, 4);
  assert.equal(compactCanvas.height, 160);
  assert.equal(largeCanvas.height, 160);
  assert.equal(reducedSignature.height, 80);
  assert.equal(reducedSignature.width, 320);
});

test("increases visible ink coverage when the stroke slider increases", async () => {
  const { expandStrokePixels } = await import(
    new URL("../app/lib/signature-processing.ts", import.meta.url).href,
  );
  const width = 7;
  const height = 7;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const centerOffset = (3 * width + 3) * 4;
  pixels.set([31, 62, 152, 255], centerOffset);

  const original = expandStrokePixels(pixels, width, height, 0);
  const expanded = expandStrokePixels(pixels, width, height, 2);
  const visiblePixels = (buffer) => {
    let count = 0;
    for (let offset = 3; offset < buffer.length; offset += 4) {
      if (buffer[offset] > 0) count += 1;
    }
    return count;
  };

  assert.equal(visiblePixels(original), 1);
  assert.ok(visiblePixels(expanded) > visiblePixels(original));
  assert.equal(expanded[centerOffset + 3], 255);
  assert.equal(expanded[(3 * width + 4) * 4 + 3], 255);
  assert.equal(pixels[(3 * width + 4) * 4 + 3], 0);
});
test("inherits global settings and keeps per-signature overrides isolated", async () => {
  const {
    createSignatureSettingsOverrides,
    hasSignatureSettingsOverrides,
    mergeSignatureSettingsOverrides,
    resolveSignatureSettings,
  } = await import(
    new URL("../app/lib/signature-processing.ts", import.meta.url).href,
  );
  const globalSettings = {
    contrast: 12,
    strokeWidth: 1,
    margin: 30,
    inkColor: null,
  };

  const firstOverrides = mergeSignatureSettingsOverrides(
    globalSettings,
    undefined,
    { contrast: 42 },
  );
  const firstSignature = resolveSignatureSettings(globalSettings, firstOverrides);
  const secondSignature = resolveSignatureSettings(globalSettings);

  assert.deepEqual(firstOverrides, { contrast: 42 });
  assert.equal(firstSignature.contrast, 42);
  assert.equal(secondSignature.contrast, 12);

  const changedGlobals = { ...globalSettings, margin: 45 };
  assert.equal(resolveSignatureSettings(changedGlobals, firstOverrides).margin, 45);
  assert.equal(resolveSignatureSettings(changedGlobals, firstOverrides).contrast, 42);

  const inheritedAgain = mergeSignatureSettingsOverrides(
    globalSettings,
    firstOverrides,
    { contrast: globalSettings.contrast },
  );
  assert.deepEqual(inheritedAgain, {});
  assert.equal(hasSignatureSettingsOverrides(inheritedAgain), false);

  const presetOverrides = createSignatureSettingsOverrides(globalSettings, {
    ...globalSettings,
    strokeWidth: 4,
    inkColor: "#1F3E98",
  });
  assert.deepEqual(presetOverrides, {
    strokeWidth: 4,
    inkColor: "#1F3E98",
  });
});
