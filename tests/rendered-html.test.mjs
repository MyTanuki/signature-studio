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
  assert.match(processing, /visibleDarkness\(red, green, blue, alpha\) \/ 255/);
  assert.match(processing, /inkColor must be a six-digit hex color/);
  assert.doesNotMatch(studio, /fetch\(["']https?:\/\//i);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.deepEqual(JSON.parse(hosting), { d1: null, r2: null });
});
