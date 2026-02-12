// Background removal module
// Primary: rembg-webgpu (WebGPU -> WASM fallback internally)
// Fallback: luminance keying for tattoo-on-paper uploads

const REMBG_CDN = 'https://cdn.jsdelivr.net/npm/rembg-webgpu@0.2.1/+esm';

let rembgPromise = null;

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

function mapProgress(phase, progress) {
    if (phase === 'downloading') return 8 + (progress * 0.55);
    if (phase === 'building') return 72;
    if (phase === 'ready') return 86;
    return 8;
}

async function cleanupAlpha(blob) {
    const image = await loadImageFromFile(blob);
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];

        // Drop faint background noise while preserving thin dark edges.
        if (alpha < 16) {
            data[i + 3] = 0;
        } else if (alpha < 64) {
            data[i + 3] = Math.min(255, Math.round((alpha - 10) * 1.5));
        }
    }

    ctx.putImageData(imageData, 0, 0);

    return new Promise((resolve, reject) => {
        canvas.toBlob((result) => {
            if (!result) {
                reject(new Error('Failed to encode cleaned PNG'));
                return;
            }
            resolve(result);
        }, 'image/png');
    });
}

function looksEmpty(bitmap) {
    const sample = document.createElement('canvas');
    sample.width = 96;
    sample.height = 96;

    const ctx = sample.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, sample.width, sample.height);

    const rgba = ctx.getImageData(0, 0, sample.width, sample.height).data;
    let visibleCount = 0;

    for (let i = 3; i < rgba.length; i += 4) {
        if (rgba[i] > 24) visibleCount += 1;
    }

    return visibleCount < 60;
}

async function removeWithRembg(imageInput, onProgress) {
    const rembg = await withTimeout(initRembg(), 10000, 'Rembg init');
    const { removeBackground, subscribeToProgress } = rembg;

    const unsubscribe = subscribeToProgress(({ phase, progress }) => {
        onProgress(Math.round(mapProgress(phase, progress)));
    });

    const srcUrl = URL.createObjectURL(imageInput);

    try {
        const result = await withTimeout(removeBackground(srcUrl), 20000, 'Rembg processing');
        onProgress(92);

        const blob = await fetch(result.blobUrl).then((response) => response.blob());

        URL.revokeObjectURL(result.blobUrl);
        URL.revokeObjectURL(result.previewUrl);

        const cleaned = await cleanupAlpha(blob);
        onProgress(100);
        return cleaned;
    } finally {
        unsubscribe();
        URL.revokeObjectURL(srcUrl);
    }
}

function removeByLuminance(imageInput, onProgress) {
    onProgress(55);

    return loadImageFromFile(imageInput).then((image) => {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(image, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const luma = (0.299 * data[i]) + (0.587 * data[i + 1]) + (0.114 * data[i + 2]);

            let alpha = 255 - luma;
            if (luma > 230) alpha = 0;
            if (luma < 42) alpha = 255;

            data[i + 3] = Math.max(0, Math.min(255, Math.round(alpha)));
        }

        ctx.putImageData(imageData, 0, 0);
        onProgress(90);

        return new Promise((resolve, reject) => {
            canvas.toBlob((result) => {
                if (!result) {
                    reject(new Error('Fallback conversion failed'));
                    return;
                }
                onProgress(100);
                resolve(result);
            }, 'image/png');
        });
    });
}

export async function removeImageBackground(imageInput, onProgress = () => { }) {
    onProgress(6);

    try {
        const result = await removeWithRembg(imageInput, onProgress);
        const bitmap = await createImageBitmap(result);
        const empty = looksEmpty(bitmap);
        bitmap.close();

        if (!empty) return result;
    } catch (error) {
        console.warn('rembg-webgpu failed:', error);
    }

    return removeByLuminance(imageInput, onProgress);
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
