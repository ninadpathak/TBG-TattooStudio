// Background removal module
// Stability-first pipeline:
// 1) @imgly/background-removal (primary)
// 2) rembg-webgpu fallback
// 3) simple luminance fallback
// Post-processing is intentionally conservative to preserve tattoo details.

const IMGLY_CDN = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm';
const REMBG_CDN = 'https://cdn.jsdelivr.net/npm/rembg-webgpu@0.2.1/+esm';

let imglyPromise = null;
let rembgPromise = null;

function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms))
    ]);
}

function initImgly() {
    if (!imglyPromise) {
        imglyPromise = import(IMGLY_CDN)
            .then((module) => module.removeBackground)
            .catch((error) => {
                imglyPromise = null;
                throw error;
            });
    }
    return imglyPromise;
}

function initRembg() {
    if (!rembgPromise) {
        rembgPromise = import(REMBG_CDN).catch((error) => {
            rembgPromise = null;
            throw error;
        });
    }
    return rembgPromise;
}

function clamp(v, min = 0, max = 255) {
    return Math.max(min, Math.min(max, v));
}

async function toCanvasData(input) {
    const image = await loadImageFromFile(input);
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);

    return {
        canvas,
        ctx,
        imageData: ctx.getImageData(0, 0, canvas.width, canvas.height)
    };
}

function encodePng(canvas, ctx, imageData) {
    ctx.putImageData(imageData, 0, 0);
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('PNG encode failed'));
                return;
            }
            resolve(blob);
        }, 'image/png');
    });
}

async function conservativeAlphaCleanup(blob) {
    const { canvas, ctx, imageData } = await toCanvasData(blob);
    const data = imageData.data;

    // Keep detail: only remove very faint haze and gently strengthen semi-opaque pixels.
    for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];

        if (a < 10) {
            data[i + 3] = 0;
        } else if (a < 42) {
            data[i + 3] = clamp(Math.round((a - 6) * 1.35));
        }
    }

    return encodePng(canvas, ctx, imageData);
}

async function analyzeMaskQuality(blob) {
    const { canvas, imageData } = await toCanvasData(blob);
    const data = imageData.data;

    const w = canvas.width;
    const h = canvas.height;
    const total = w * h;

    let visible = 0;
    let edgeResidue = 0;

    const isEdgePixel = (x, y) => x < 8 || y < 8 || x >= w - 8 || y >= h - 8;

    for (let p = 0, i = 0; i < data.length; i += 4, p += 1) {
        const a = data[i + 3];
        if (a > 18) {
            visible += 1;

            const x = p % w;
            const y = Math.floor(p / w);
            if (isEdgePixel(x, y)) edgeResidue += 1;
        }
    }

    const visibleRatio = visible / total;
    const edgeResidueRatio = edgeResidue / Math.max(1, visible);

    return {
        visibleRatio,
        edgeResidueRatio,
        // Lower score is better.
        score: (edgeResidueRatio * 100) + (visibleRatio < 0.003 ? 80 : 0)
    };
}

async function removeWithImgly(file, onProgress) {
    const removeBackground = await withTimeout(initImgly(), 10000, 'Imgly init');

    const config = {
        model: 'medium',
        output: { format: 'image/png', quality: 1 },
        progress: (key, current, total) => {
            const ratio = total > 0 ? current / total : 0;
            const base = key && key.includes('fetch') ? 12 : 48;
            const span = key && key.includes('fetch') ? 30 : 40;
            onProgress(Math.round(base + (ratio * span)));
        }
    };

    return withTimeout(removeBackground(file, config), 22000, 'Imgly processing');
}

async function removeWithRembg(file, onProgress) {
    const rembg = await withTimeout(initRembg(), 10000, 'Rembg init');
    const { removeBackground, subscribeToProgress } = rembg;

    const unsubscribe = subscribeToProgress(({ phase, progress }) => {
        if (phase === 'downloading') {
            onProgress(Math.round(18 + (progress * 0.3)));
        } else if (phase === 'building') {
            onProgress(60);
        } else if (phase === 'ready') {
            onProgress(70);
        }
    });

    const src = URL.createObjectURL(file);

    try {
        const result = await withTimeout(removeBackground(src), 22000, 'Rembg processing');
        const blob = await fetch(result.blobUrl).then((res) => res.blob());

        URL.revokeObjectURL(result.blobUrl);
        URL.revokeObjectURL(result.previewUrl);

        return blob;
    } finally {
        unsubscribe();
        URL.revokeObjectURL(src);
    }
}

async function removeByLuminance(file) {
    const { canvas, ctx, imageData } = await toCanvasData(file);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        const y = (0.299 * data[i]) + (0.587 * data[i + 1]) + (0.114 * data[i + 2]);
        let a = 255 - y;

        if (y > 235) a = 0;
        if (y < 35) a = 255;

        data[i + 3] = clamp(Math.round(a));
    }

    return encodePng(canvas, ctx, imageData);
}

export async function removeImageBackground(imageInput, onProgress = () => { }) {
    onProgress(6);

    const candidates = [];

    try {
        const imglyBlob = await removeWithImgly(imageInput, onProgress);
        const cleaned = await conservativeAlphaCleanup(imglyBlob);
        const quality = await analyzeMaskQuality(cleaned);
        candidates.push({ blob: cleaned, quality, source: 'imgly' });
    } catch (error) {
        console.warn('Imgly path failed:', error);
    }

    try {
        const rembgBlob = await removeWithRembg(imageInput, onProgress);
        const cleaned = await conservativeAlphaCleanup(rembgBlob);
        const quality = await analyzeMaskQuality(cleaned);
        candidates.push({ blob: cleaned, quality, source: 'rembg' });
    } catch (error) {
        console.warn('Rembg path failed:', error);
    }

    if (candidates.length > 0) {
        candidates.sort((a, b) => a.quality.score - b.quality.score);
        onProgress(100);
        return candidates[0].blob;
    }

    const fallback = await removeByLuminance(imageInput);
    const cleanedFallback = await conservativeAlphaCleanup(fallback);
    onProgress(100);
    return cleanedFallback;
}

export function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

export function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
        if (file instanceof File || file instanceof Blob) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = event.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
            return;
        }

        if (typeof file === 'string') {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = file;
            return;
        }

        reject(new Error('Invalid input to loadImageFromFile'));
    });
}
