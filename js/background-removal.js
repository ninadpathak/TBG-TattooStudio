// Background removal module
// Quality-first pipeline:
// 1) rembg-webgpu (fast)
// 2) @imgly/background-removal (cleaner fallback when residue remains)
// 3) luminance fallback
// Every candidate goes through matte refinement focused on tattoo-on-paper inputs.

const REMBG_CDN = 'https://cdn.jsdelivr.net/npm/rembg-webgpu@0.2.1/+esm';
const IMGLY_CDN = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm';

let rembgPromise = null;
let imglyPromise = null;

function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms))
    ]);
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

function clamp(value, min = 0, max = 255) {
    return Math.max(min, Math.min(max, value));
}

function rgbSaturation(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max === 0) return 0;
    return (max - min) / max;
}

function luma(r, g, b) {
    return (0.299 * r) + (0.587 * g) + (0.114 * b);
}

function colorDistance(r, g, b, bg) {
    const dr = r - bg.r;
    const dg = g - bg.g;
    const db = b - bg.b;
    return Math.sqrt((dr * dr) + (dg * dg) + (db * db));
}

function estimatePaperColor(imageData, width, height) {
    const data = imageData.data;
    const sample = [];
    const stepX = Math.max(1, Math.floor(width / 60));
    const stepY = Math.max(1, Math.floor(height / 60));

    const push = (x, y) => {
        const i = ((y * width) + x) * 4;
        sample.push([data[i], data[i + 1], data[i + 2]]);
    };

    for (let x = 0; x < width; x += stepX) {
        push(x, 0);
        push(x, height - 1);
    }

    for (let y = 0; y < height; y += stepY) {
        push(0, y);
        push(width - 1, y);
    }

    sample.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
    const mid = sample[Math.floor(sample.length / 2)] || [245, 245, 245];

    return { r: mid[0], g: mid[1], b: mid[2] };
}

async function imageDataFromInput(input) {
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

function imageDataToBlob(canvas, ctx, imageData) {
    ctx.putImageData(imageData, 0, 0);
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('Failed to encode PNG'));
                return;
            }
            resolve(blob);
        }, 'image/png');
    });
}

function refineMask(imageData, width, height, bg) {
    const data = imageData.data;
    const paperLike = new Uint8Array(width * height);

    let opaqueCount = 0;
    let residueCount = 0;
    let hazeCount = 0;

    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        let a = data[i + 3];

        const sat = rgbSaturation(r, g, b);
        const y = luma(r, g, b);
        const dist = colorDistance(r, g, b, bg);

        const nearPaper = dist < 58 && sat < 0.24 && y > 102;
        paperLike[p] = nearPaper ? 1 : 0;

        if (nearPaper) {
            if (dist < 22) {
                a = 0;
            } else {
                const softness = (dist - 22) / 36;
                a = Math.round(a * Math.max(0, Math.min(1, softness * softness)));
            }
        }

        // Preserve fine, dark tattoo edges.
        if (y < 70 && sat < 0.55) {
            a = Math.max(a, 170);
        }

        if (a < 10) a = 0;
        data[i + 3] = clamp(a);

        if (a > 20) {
            opaqueCount += 1;
            if (nearPaper) residueCount += 1;
        } else if (a > 0) {
            hazeCount += 1;
        }
    }

    // Flood-clean connected paper-like residue from borders.
    const total = width * height;
    const visited = new Uint8Array(total);
    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;

    const tryPush = (x, y) => {
        const idx = (y * width) + x;
        if (visited[idx]) return;

        const a = data[(idx * 4) + 3];
        if (a > 210) return;
        if (!paperLike[idx]) return;

        visited[idx] = 1;
        queue[tail++] = idx;
    };

    for (let x = 0; x < width; x += 1) {
        tryPush(x, 0);
        tryPush(x, height - 1);
    }
    for (let y = 0; y < height; y += 1) {
        tryPush(0, y);
        tryPush(width - 1, y);
    }

    while (head < tail) {
        const idx = queue[head++];
        data[(idx * 4) + 3] = 0;

        const x = idx % width;
        const y = Math.floor(idx / width);

        if (x > 0) tryPush(x - 1, y);
        if (x < width - 1) tryPush(x + 1, y);
        if (y > 0) tryPush(x, y - 1);
        if (y < height - 1) tryPush(x, y + 1);
    }

    const visibleRatio = opaqueCount / total;
    const residueRatio = opaqueCount > 0 ? residueCount / opaqueCount : 1;
    const hazeRatio = hazeCount / total;

    const score = (residueRatio * 120) + (hazeRatio * 40) + (visibleRatio < 0.003 ? 200 : 0);

    return {
        imageData,
        score,
        metrics: { visibleRatio, residueRatio, hazeRatio }
    };
}

async function refineAndScore(blob, bgColor) {
    const { canvas, ctx, imageData } = await imageDataFromInput(blob);
    const { imageData: refined, score, metrics } = refineMask(imageData, canvas.width, canvas.height, bgColor);
    const refinedBlob = await imageDataToBlob(canvas, ctx, refined);

    return {
        blob: refinedBlob,
        score,
        metrics
    };
}

function isLikelyEmpty(metrics) {
    return metrics.visibleRatio < 0.0025;
}

function mapRembgProgress(phase, progress) {
    if (phase === 'downloading') return 8 + (progress * 0.5);
    if (phase === 'building') return 62;
    if (phase === 'ready') return 70;
    return 8;
}

async function removeWithRembg(imageInput, onProgress) {
    const rembg = await withTimeout(initRembg(), 12000, 'Rembg init');
    const { removeBackground, subscribeToProgress } = rembg;

    const unsubscribe = subscribeToProgress(({ phase, progress }) => {
        onProgress(Math.round(mapRembgProgress(phase, progress)));
    });

    const srcUrl = URL.createObjectURL(imageInput);

    try {
        const result = await withTimeout(removeBackground(srcUrl), 24000, 'Rembg processing');
        const blob = await fetch(result.blobUrl).then((response) => response.blob());

        URL.revokeObjectURL(result.blobUrl);
        URL.revokeObjectURL(result.previewUrl);

        return blob;
    } finally {
        unsubscribe();
        URL.revokeObjectURL(srcUrl);
    }
}

async function removeWithImgly(imageInput, onProgress) {
    const removeBackground = await withTimeout(initImgly(), 12000, 'Imgly init');

    const config = {
        model: 'medium',
        output: { format: 'image/png', quality: 0.98 },
        progress: (key, current, total) => {
            const ratio = total > 0 ? current / total : 0;
            const base = key && key.includes('fetch') ? 45 : 72;
            const span = key && key.includes('fetch') ? 20 : 18;
            onProgress(Math.round(base + (ratio * span)));
        }
    };

    return withTimeout(removeBackground(imageInput, config), 18000, 'Imgly processing');
}

async function removeByLuminance(imageInput) {
    const { canvas, ctx, imageData } = await imageDataFromInput(imageInput);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        const y = luma(data[i], data[i + 1], data[i + 2]);
        let alpha = 255 - y;

        if (y > 232) alpha = 0;
        if (y < 42) alpha = 255;

        data[i + 3] = clamp(Math.round(alpha));
    }

    return imageDataToBlob(canvas, ctx, imageData);
}

export async function removeImageBackground(imageInput, onProgress = () => { }) {
    onProgress(5);

    const original = await imageDataFromInput(imageInput);
    const bgColor = estimatePaperColor(original.imageData, original.canvas.width, original.canvas.height);

    let best = null;

    try {
        const rembgBlob = await removeWithRembg(imageInput, onProgress);
        const rembgCandidate = await refineAndScore(rembgBlob, bgColor);
        best = rembgCandidate;

        // If rembg is already clean, keep it fast.
        if (!isLikelyEmpty(rembgCandidate.metrics) && rembgCandidate.score < 18) {
            onProgress(100);
            return rembgCandidate.blob;
        }
    } catch (error) {
        console.warn('rembg-webgpu path failed:', error);
    }

    try {
        const imglyBlob = await removeWithImgly(imageInput, onProgress);
        const imglyCandidate = await refineAndScore(imglyBlob, bgColor);

        if (!best || imglyCandidate.score < best.score) {
            best = imglyCandidate;
        }
    } catch (error) {
        console.warn('@imgly/background-removal path failed:', error);
    }

    if (best && !isLikelyEmpty(best.metrics)) {
        onProgress(100);
        return best.blob;
    }

    const fallbackBlob = await removeByLuminance(imageInput);
    const fallbackCandidate = await refineAndScore(fallbackBlob, bgColor);
    onProgress(100);
    return fallbackCandidate.blob;
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
