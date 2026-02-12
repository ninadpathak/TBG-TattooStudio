// Background Removal Module
// Primary engine: rembg-webgpu (WebGPU/WASM auto fallback)
// Safety fallback: @imgly/background-removal
// Last-resort fallback: luminance key extraction for stencil-like tattoo images

const REMBG_CDN = 'https://cdn.jsdelivr.net/npm/rembg-webgpu@0.2.1/+esm';
const IMGLY_CDN = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm';

let rembgModule = null;
let rembgInitPromise = null;
let imglyRemoveBackground = null;
let imglyInitPromise = null;

async function initRembg() {
    if (rembgModule) return rembgModule;
    if (!rembgInitPromise) {
        rembgInitPromise = import(REMBG_CDN)
            .then((module) => {
                rembgModule = module;
                return module;
            })
            .catch((error) => {
                rembgInitPromise = null;
                throw error;
            });
    }
    return rembgInitPromise;
}

async function initImgly() {
    if (imglyRemoveBackground) return imglyRemoveBackground;
    if (!imglyInitPromise) {
        imglyInitPromise = import(IMGLY_CDN)
            .then((module) => {
                imglyRemoveBackground = module.removeBackground;
                return imglyRemoveBackground;
            })
            .catch((error) => {
                imglyInitPromise = null;
                throw error;
            });
    }
    return imglyInitPromise;
}

function clampProgress(value) {
    return Math.max(0, Math.min(100, Math.round(value)));
}

function isLikelyTransparent(bitmap) {
    const probe = document.createElement('canvas');
    probe.width = 96;
    probe.height = 96;
    const ctx = probe.getContext('2d', { willReadFrequently: true });

    ctx.drawImage(bitmap, 0, 0, probe.width, probe.height);
    const alpha = ctx.getImageData(0, 0, probe.width, probe.height).data;

    let visible = 0;
    for (let i = 3; i < alpha.length; i += 4) {
        if (alpha[i] > 24) visible += 1;
    }

    // If almost everything is transparent, we likely stripped the tattoo itself.
    return visible < 55;
}

function refineSmallEdges(blob) {
    return new Promise((resolve, reject) => {
        loadImageFromFile(blob)
            .then((img) => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });

                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;

                // Tight alpha cleanup so hairline tattoo details stay but paper haze is removed.
                for (let i = 0; i < data.length; i += 4) {
                    const a = data[i + 3];
                    if (a < 18) {
                        data[i + 3] = 0;
                    } else if (a < 70) {
                        data[i + 3] = Math.min(255, Math.round((a - 12) * 1.55));
                    }
                }

                ctx.putImageData(imageData, 0, 0);
                canvas.toBlob((resultBlob) => {
                    if (!resultBlob) {
                        reject(new Error('Failed to encode refined image'));
                        return;
                    }
                    resolve(resultBlob);
                }, 'image/png');
            })
            .catch((error) => reject(error));
    });
}

async function removeWithRembg(imageInput, onProgress) {
    const module = await initRembg();
    const { removeBackground, subscribeToProgress } = module;

    let lastProgress = 10;
    const unsubscribe = subscribeToProgress(({ phase, progress }) => {
        if (phase === 'downloading') {
            lastProgress = clampProgress(10 + (progress * 0.5));
        } else if (phase === 'building') {
            lastProgress = Math.max(lastProgress, 72);
        } else if (phase === 'ready') {
            lastProgress = Math.max(lastProgress, 84);
        }
        onProgress(lastProgress);
    });

    const objectUrl = URL.createObjectURL(imageInput);

    try {
        const result = await removeBackground(objectUrl);
        onProgress(92);

        const outputBlob = await fetch(result.blobUrl).then((res) => res.blob());
        URL.revokeObjectURL(result.blobUrl);
        URL.revokeObjectURL(result.previewUrl);

        const refined = await refineSmallEdges(outputBlob);
        onProgress(100);
        return refined;
    } finally {
        unsubscribe();
        URL.revokeObjectURL(objectUrl);
    }
}

async function removeWithImgly(imageInput, onProgress) {
    const removeBackground = await initImgly();

    const config = {
        progress: (key, current, total) => {
            const ratio = total > 0 ? current / total : 0;
            const base = key && key.includes('fetch') ? 22 : 58;
            const span = key && key.includes('fetch') ? 28 : 34;
            onProgress(clampProgress(base + ratio * span));
        },
        output: {
            format: 'image/png',
            quality: 0.95
        },
        model: 'small'
    };

    const resultBlob = await removeBackground(imageInput, config);
    const refined = await refineSmallEdges(resultBlob);
    onProgress(100);
    return refined;
}

function removeSketchBackground(imageInput, onProgress) {
    onProgress(60);

    return new Promise((resolve, reject) => {
        loadImageFromFile(imageInput)
            .then((img) => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });

                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;

                for (let i = 0; i < data.length; i += 4) {
                    const luma = (0.299 * data[i]) + (0.587 * data[i + 1]) + (0.114 * data[i + 2]);
                    let alpha = 255 - luma;

                    if (luma > 232) alpha = 0;
                    if (luma < 40) alpha = 255;

                    data[i + 3] = Math.max(0, Math.min(255, Math.round(alpha)));
                }

                ctx.putImageData(imageData, 0, 0);
                onProgress(92);

                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('Fallback processing failed'));
                        return;
                    }
                    onProgress(100);
                    resolve(blob);
                }, 'image/png');
            })
            .catch((error) => reject(error));
    });
}

export async function removeImageBackground(imageInput, onProgress = () => { }) {
    onProgress(6);

    try {
        const blob = await Promise.race([
            removeWithRembg(imageInput, onProgress),
            new Promise((_, reject) => setTimeout(() => reject(new Error('rembg timeout')), 18000))
        ]);

        const bitmap = await createImageBitmap(blob);
        const tooEmpty = isLikelyTransparent(bitmap);
        bitmap.close();

        if (!tooEmpty) {
            return blob;
        }
    } catch (error) {
        console.warn('rembg-webgpu failed, trying imgly fallback:', error);
    }

    try {
        return await Promise.race([
            removeWithImgly(imageInput, onProgress),
            new Promise((_, reject) => setTimeout(() => reject(new Error('imgly timeout')), 10000))
        ]);
    } catch (error) {
        console.warn('@imgly/background-removal failed, trying sketch fallback:', error);
    }

    return removeSketchBackground(imageInput, onProgress);
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
