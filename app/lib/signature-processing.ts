export type SignatureBackground = "transparent" | "white";
export type HorizontalAlignment = "left" | "center" | "right";
export type VerticalAlignment = "top" | "center" | "bottom";

export interface Settings {
  outputWidth: number;
  outputHeight: number;
  targetHeight: number;
  margin: number;
  /** Distance from white (0-255) that is treated as background. Zero disables removal. */
  removal: number;
  /** Width of the partially transparent edge after background removal (0-255). */
  feather: number;
  /** Contrast adjustment from -100 to 100. Zero leaves contrast unchanged. */
  contrast: number;
  grayscale: boolean;
  autoCrop: boolean;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  background: SignatureBackground;
  alignX: HorizontalAlignment;
  alignY: VerticalAlignment;
}

export interface QualityReport {
  score: number;
  label: "Excellent" | "Good" | "Fair" | "Needs attention";
  warnings: string[];
  recommendations: string[];
  /** Percentage of output pixels occupied by visible signature ink. */
  inkCoverage: number;
}

export interface ProcessedResult {
  canvas: HTMLCanvasElement;
  sourceWidth: number;
  sourceHeight: number;
  cropWidth: number;
  cropHeight: number;
  scale: number;
  quality: QualityReport;
}

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MAX_SOURCE_DIMENSION = 5_000;
const SQRT_THREE = Math.sqrt(3);

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document === "undefined") {
    throw new Error("Signature processing is only available in a browser.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
}

function getContext(
  canvas: HTMLCanvasElement,
  willReadFrequently = false,
): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { willReadFrequently });
  if (!context) {
    throw new Error("The browser could not create a 2D canvas context.");
  }
  return context;
}

function visibleDarkness(
  red: number,
  green: number,
  blue: number,
  alpha: number,
): number {
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return (255 - luminance) * (alpha / 255);
}

function isForegroundPixel(
  red: number,
  green: number,
  blue: number,
  alpha: number,
): boolean {
  return alpha >= 8 && visibleDarkness(red, green, blue, alpha) >= 14;
}

function findForegroundBounds(imageData: ImageData): Bounds | null {
  const { data, width, height } = imageData;
  let minimumX = width;
  let minimumY = height;
  let maximumX = -1;
  let maximumY = -1;

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const offset = rowOffset + x * 4;
      if (
        !isForegroundPixel(
          data[offset],
          data[offset + 1],
          data[offset + 2],
          data[offset + 3],
        )
      ) {
        continue;
      }

      minimumX = Math.min(minimumX, x);
      minimumY = Math.min(minimumY, y);
      maximumX = Math.max(maximumX, x);
      maximumY = Math.max(maximumY, y);
    }
  }

  if (maximumX < minimumX || maximumY < minimumY) {
    return null;
  }

  return {
    x: minimumX,
    y: minimumY,
    width: maximumX - minimumX + 1,
    height: maximumY - minimumY + 1,
  };
}

function expandBounds(
  bounds: Bounds,
  padding: number,
  maximumWidth: number,
  maximumHeight: number,
): Bounds {
  const x = Math.max(0, bounds.x - padding);
  const y = Math.max(0, bounds.y - padding);
  const right = Math.min(maximumWidth, bounds.x + bounds.width + padding);
  const bottom = Math.min(maximumHeight, bounds.y + bounds.height + padding);
  return { x, y, width: right - x, height: bottom - y };
}

function copyRegion(source: HTMLCanvasElement, bounds: Bounds): HTMLCanvasElement {
  const canvas = createCanvas(bounds.width, bounds.height);
  const context = getContext(canvas);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    source,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    0,
    0,
    bounds.width,
    bounds.height,
  );
  return canvas;
}

function filterPixels(canvas: HTMLCanvasElement, settings: Settings): void {
  const context = getContext(canvas, true);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  const removal = clamp(settings.removal, 0, 255);
  const feather = clamp(settings.feather, 0, 255);
  const contrast = clamp(settings.contrast, -100, 100);
  const contrastFactor = (100 + contrast) / 100;

  for (let offset = 0; offset < pixels.length; offset += 4) {
    let red = pixels[offset];
    let green = pixels[offset + 1];
    let blue = pixels[offset + 2];
    let alpha = pixels[offset + 3];

    if (removal > 0 && alpha > 0) {
      const redDistance = 255 - red;
      const greenDistance = 255 - green;
      const blueDistance = 255 - blue;
      const distanceFromWhite =
        Math.sqrt(
          redDistance * redDistance +
            greenDistance * greenDistance +
            blueDistance * blueDistance,
        ) / SQRT_THREE;

      let retainedOpacity: number;
      if (feather === 0) {
        retainedOpacity = distanceFromWhite <= removal ? 0 : 1;
      } else {
        const progress = clamp((distanceFromWhite - removal) / feather, 0, 1);
        retainedOpacity = progress * progress * (3 - 2 * progress);
      }
      alpha *= retainedOpacity;
    }

    if (settings.grayscale) {
      const gray = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      red = gray;
      green = gray;
      blue = gray;
    }

    if (contrast !== 0) {
      red = (red - 128) * contrastFactor + 128;
      green = (green - 128) * contrastFactor + 128;
      blue = (blue - 128) * contrastFactor + 128;
    }

    pixels[offset] = Math.round(clamp(red, 0, 255));
    pixels[offset + 1] = Math.round(clamp(green, 0, 255));
    pixels[offset + 2] = Math.round(clamp(blue, 0, 255));
    pixels[offset + 3] = Math.round(clamp(alpha, 0, 255));
  }

  context.putImageData(imageData, 0, 0);
}

function transformCanvas(
  source: HTMLCanvasElement,
  rotation: number,
  flipX: boolean,
  flipY: boolean,
): HTMLCanvasElement {
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  if (normalizedRotation === 0 && !flipX && !flipY) {
    return source;
  }

  const radians = (normalizedRotation * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  const width = Math.ceil(source.width * cosine + source.height * sine);
  const height = Math.ceil(source.width * sine + source.height * cosine);
  const canvas = createCanvas(width, height);
  const context = getContext(canvas);

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(radians);
  context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

function trimTransformedCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const context = getContext(canvas, true);
  const bounds = findForegroundBounds(
    context.getImageData(0, 0, canvas.width, canvas.height),
  );
  if (!bounds) {
    return canvas;
  }

  const expanded = expandBounds(bounds, 1, canvas.width, canvas.height);
  if (
    expanded.x === 0 &&
    expanded.y === 0 &&
    expanded.width === canvas.width &&
    expanded.height === canvas.height
  ) {
    return canvas;
  }
  return copyRegion(canvas, expanded);
}

function alignmentOffset(
  availableSpace: number,
  occupiedSpace: number,
  alignment: "left" | "center" | "right" | "top" | "bottom",
): number {
  const remainingSpace = Math.max(0, availableSpace - occupiedSpace);
  if (alignment === "center") {
    return remainingSpace / 2;
  }
  if (alignment === "right" || alignment === "bottom") {
    return remainingSpace;
  }
  return 0;
}

function validateSettings(settings: Settings): void {
  assertFinite("outputWidth", settings.outputWidth);
  assertFinite("outputHeight", settings.outputHeight);
  assertFinite("targetHeight", settings.targetHeight);
  assertFinite("margin", settings.margin);
  assertFinite("removal", settings.removal);
  assertFinite("feather", settings.feather);
  assertFinite("contrast", settings.contrast);
  assertFinite("rotation", settings.rotation);

  if (settings.outputWidth <= 0 || settings.outputHeight <= 0) {
    throw new RangeError("Output dimensions must be greater than zero.");
  }
  if (
    settings.outputWidth > MAX_SOURCE_DIMENSION ||
    settings.outputHeight > MAX_SOURCE_DIMENSION
  ) {
    throw new RangeError("Output dimensions cannot exceed 5000 x 5000 pixels.");
  }
  if (settings.targetHeight <= 0) {
    throw new RangeError("Target height must be greater than zero.");
  }
  if (settings.margin < 0) {
    throw new RangeError("Margin cannot be negative.");
  }

  const outputWidth = Math.ceil(settings.outputWidth);
  const outputHeight = Math.ceil(settings.outputHeight);
  if (settings.margin * 2 >= outputWidth || settings.margin * 2 >= outputHeight) {
    throw new RangeError("Margin leaves no drawable area in the output.");
  }
}

export function loadImageSource(sourceUrl: string): Promise<HTMLImageElement> {
  if (typeof Image === "undefined") {
    return Promise.reject(
      new Error("Image loading is only available in a browser."),
    );
  }
  if (!sourceUrl.trim()) {
    return Promise.reject(new TypeError("Image source URL cannot be empty."));
  }

  return new Promise((resolve, reject) => {
    const image = new Image();

    if (/^https?:\/\//i.test(sourceUrl) && typeof window !== "undefined") {
      try {
        const url = new URL(sourceUrl, window.location.href);
        if (url.origin !== window.location.origin) {
          image.crossOrigin = "anonymous";
        }
      } catch {
        // Let the browser report malformed or unsupported URLs through onerror.
      }
    }

    image.decoding = "async";
    image.onload = () => {
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        reject(new Error("The image has no readable dimensions."));
        return;
      }
      resolve(image);
    };
    image.onerror = () => {
      reject(
        new Error(
          "Unable to load the image. The file may be damaged or blocked by CORS.",
        ),
      );
    };
    image.src = sourceUrl;
  });
}

export async function processSignature(
  sourceUrl: string,
  settings: Settings,
): Promise<ProcessedResult> {
  validateSettings(settings);
  const image = await loadImageSource(sourceUrl);
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;

  if (
    sourceWidth > MAX_SOURCE_DIMENSION ||
    sourceHeight > MAX_SOURCE_DIMENSION
  ) {
    throw new RangeError("Source image cannot exceed 5000 x 5000 pixels.");
  }

  const sourceCanvas = createCanvas(sourceWidth, sourceHeight);
  const sourceContext = getContext(sourceCanvas);
  sourceContext.imageSmoothingEnabled = true;
  sourceContext.imageSmoothingQuality = "high";
  sourceContext.drawImage(image, 0, 0, sourceWidth, sourceHeight);

  filterPixels(sourceCanvas, settings);

  let cropBounds: Bounds = {
    x: 0,
    y: 0,
    width: sourceCanvas.width,
    height: sourceCanvas.height,
  };

  if (settings.autoCrop) {
    const readableContext = getContext(sourceCanvas, true);
    const detectedBounds = findForegroundBounds(
      readableContext.getImageData(
        0,
        0,
        sourceCanvas.width,
        sourceCanvas.height,
      ),
    );
    if (detectedBounds) {
      cropBounds = expandBounds(
        detectedBounds,
        1,
        sourceCanvas.width,
        sourceCanvas.height,
      );
    }
  }

  const croppedCanvas = copyRegion(sourceCanvas, cropBounds);
  const transformedWithPadding = transformCanvas(
    croppedCanvas,
    settings.rotation,
    settings.flipX,
    settings.flipY,
  );
  const transformedCanvas = settings.autoCrop
    ? trimTransformedCanvas(transformedWithPadding)
    : transformedWithPadding;

  const outputWidth = Math.ceil(settings.outputWidth);
  const outputHeight = Math.ceil(settings.outputHeight);
  const margin = settings.margin;
  const availableWidth = outputWidth - margin * 2;
  const availableHeight = outputHeight - margin * 2;
  const scale = Math.min(
    settings.targetHeight / transformedCanvas.height,
    availableWidth / transformedCanvas.width,
    availableHeight / transformedCanvas.height,
  );
  const drawnWidth = transformedCanvas.width * scale;
  const drawnHeight = transformedCanvas.height * scale;
  const drawX =
    margin +
    alignmentOffset(availableWidth, drawnWidth, settings.alignX);
  const drawY =
    margin +
    alignmentOffset(availableHeight, drawnHeight, settings.alignY);

  const outputCanvas = createCanvas(outputWidth, outputHeight);
  const outputContext = getContext(outputCanvas);
  if (settings.background === "white") {
    outputContext.fillStyle = "#ffffff";
    outputContext.fillRect(0, 0, outputWidth, outputHeight);
  } else {
    outputContext.clearRect(0, 0, outputWidth, outputHeight);
  }
  outputContext.imageSmoothingEnabled = true;
  outputContext.imageSmoothingQuality = "high";
  outputContext.drawImage(
    transformedCanvas,
    drawX,
    drawY,
    drawnWidth,
    drawnHeight,
  );

  return {
    canvas: outputCanvas,
    sourceWidth,
    sourceHeight,
    cropWidth: cropBounds.width,
    cropHeight: cropBounds.height,
    scale,
    quality: computeQuality(outputCanvas),
  };
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = "image/png",
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const normalizedQuality =
        quality === undefined || !Number.isFinite(quality)
          ? undefined
          : clamp(quality, 0, 1);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error(`The browser could not encode the canvas as ${type}.`));
          }
        },
        type,
        normalizedQuality,
      );
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export function dataUrlToBlob(dataUrl: string): Blob {
  if (!dataUrl.startsWith("data:")) {
    throw new TypeError("Expected a valid data URL.");
  }

  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) {
    throw new TypeError("The data URL has no payload separator.");
  }

  const metadata = dataUrl.slice(5, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1);
  const metadataParts = metadata.split(";");
  const mediaType = metadataParts[0] || "text/plain;charset=US-ASCII";
  const isBase64 = metadataParts.some(
    (part) => part.toLowerCase() === "base64",
  );

  if (isBase64) {
    let binary: string;
    try {
      binary = atob(payload.replace(/\s/g, ""));
    } catch {
      throw new TypeError("The data URL contains invalid base64 data.");
    }
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: mediaType });
  }

  const bytes: number[] = [];
  for (let index = 0; index < payload.length; index += 1) {
    const character = payload[index];
    if (character === "%" && /^[0-9a-f]{2}$/i.test(payload.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(payload.slice(index + 1, index + 3), 16));
      index += 2;
      continue;
    }

    const codePoint = payload.codePointAt(index);
    if (codePoint === undefined) {
      continue;
    }
    const encoded = new TextEncoder().encode(String.fromCodePoint(codePoint));
    bytes.push(...encoded);
    if (codePoint > 0xffff) {
      index += 1;
    }
  }
  return new Blob([new Uint8Array(bytes)], { type: mediaType });
}

export function computeQuality(canvas: HTMLCanvasElement): QualityReport {
  const warnings: string[] = [];
  const recommendations: string[] = [];
  const context = getContext(canvas, true);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;
  const totalPixels = Math.max(1, width * height);
  let inkPixels = 0;
  let darknessTotal = 0;
  let minimumX = width;
  let minimumY = height;
  let maximumX = -1;
  let maximumY = -1;

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const offset = rowOffset + x * 4;
      const darkness = visibleDarkness(
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
      );
      if (darkness < 14) {
        continue;
      }

      inkPixels += 1;
      darknessTotal += darkness;
      minimumX = Math.min(minimumX, x);
      minimumY = Math.min(minimumY, y);
      maximumX = Math.max(maximumX, x);
      maximumY = Math.max(maximumY, y);
    }
  }

  const inkCoverage = (inkPixels / totalPixels) * 100;
  if (inkPixels === 0) {
    return {
      score: 0,
      label: "Needs attention",
      warnings: ["No visible signature ink was detected."],
      recommendations: [
        "Reduce background removal or use an image with a darker signature.",
      ],
      inkCoverage: 0,
    };
  }

  const inkWidth = maximumX - minimumX + 1;
  const inkHeight = maximumY - minimumY + 1;
  const averageDarkness = darknessTotal / inkPixels;
  let score = 100;

  if (inkCoverage < 0.35) {
    score -= 28;
    warnings.push("The signature occupies very little of the output area.");
    recommendations.push("Increase the target height or crop closer to the ink.");
  } else if (inkCoverage < 0.8) {
    score -= 12;
    warnings.push("The signature may appear too small in documents.");
    recommendations.push("Increase the target height for better legibility.");
  } else if (inkCoverage > 35) {
    score -= 12;
    warnings.push("Ink coverage is unusually high.");
    recommendations.push("Check the background-removal threshold and crop bounds.");
  }

  if (inkWidth < 120 || inkHeight < 28) {
    score -= 20;
    warnings.push("The visible signature has low pixel dimensions.");
    recommendations.push("Use a higher-resolution source image when available.");
  }

  if (
    minimumX <= 1 ||
    minimumY <= 1 ||
    maximumX >= width - 2 ||
    maximumY >= height - 2
  ) {
    score -= 25;
    warnings.push("The signature is touching an output edge and may be clipped.");
    recommendations.push("Add margin or reduce the target height.");
  }

  if (averageDarkness < 52) {
    score -= 18;
    warnings.push("The signature has weak contrast against a light background.");
    recommendations.push("Increase contrast or use a darker source image.");
  }

  score = Math.round(clamp(score, 0, 100));
  let label: QualityReport["label"];
  if (score >= 90) {
    label = "Excellent";
  } else if (score >= 75) {
    label = "Good";
  } else if (score >= 60) {
    label = "Fair";
  } else {
    label = "Needs attention";
  }

  return {
    score,
    label,
    warnings,
    recommendations,
    inkCoverage: Math.round(inkCoverage * 100) / 100,
  };
}
