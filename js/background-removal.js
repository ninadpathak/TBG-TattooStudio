// Background Removal Module
// Uses multiple approaches with fallbacks

let removeBackgroundFn = null;
let isInitialized = false;
let isInitializing = false;

// Try to initialize background removal
async function initBackgroundRemoval() {
    if (isInitialized) return true;
    if (isInitializing) {
        while (isInitializing) {
            await new Promise(r => setTimeout(r, 100));
        }
        return isInitialized;
    }

    isInitializing = true;

    try {
        // Try loading the imgly library
        const module = await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.4.5/+esm');
        removeBackgroundFn = module.removeBackground;
        isInitialized = true;
        console.log('Background removal library loaded');
        return true;
    } catch (error) {
        console.warn('Background removal library failed to load:', error);
        isInitializing = false;
        return false;
    }
}

/**
 * Simple canvas-based white/light background removal
 * Works well for tattoo images with white or light backgrounds
 */
function removeWhiteBackground(imageData, threshold = 240) {
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Check if pixel is white/light colored
        if (r > threshold && g > threshold && b > threshold) {
            data[i + 3] = 0; // Set alpha to 0 (transparent)
        }
        // Also handle near-white grays
        else if (r > 200 && g > 200 && b > 200) {
            // Fade based on how close to white
            const brightness = (r + g + b) / 3;
            const alpha = Math.max(0, 255 - ((brightness - 200) * 4.6));
            data[i + 3] = Math.min(data[i + 3], alpha);
        }
    }

    return imageData;
}

/**
 * Remove background using canvas-based approach
 * Good for tattoo designs with white/light backgrounds
 */
async function removeBackgroundCanvas(imageInput, onProgress = () => { }) {
    onProgress(10);

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
            onProgress(30);

            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');

            ctx.drawImage(img, 0, 0);
            onProgress(50);

            // Get image data and remove white background
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            removeWhiteBackground(imageData, 230);
            onProgress(80);

            ctx.putImageData(imageData, 0, 0);

            canvas.toBlob((blob) => {
                onProgress(100);
                resolve(blob);
            }, 'image/png');
        };

        img.onerror = () => reject(new Error('Failed to load image'));

        // Handle different input types
        if (imageInput instanceof File || imageInput instanceof Blob) {
            img.src = URL.createObjectURL(imageInput);
        } else if (typeof imageInput === 'string') {
            img.src = imageInput;
        } else {
            reject(new Error('Invalid image input'));
        }
    });
}

/**
 * Remove background from an image
 * @param {File|Blob|string} imageInput - Image file, blob, or data URL
 * @param {Function} onProgress - Progress callback (0-100)
 * @returns {Promise<Blob>} - Processed image as blob with transparent background
 */
export async function removeImageBackground(imageInput, onProgress = () => { }) {
    onProgress(5);

    // First try the ML-based approach
    const mlAvailable = await initBackgroundRemoval();

    if (mlAvailable && removeBackgroundFn) {
        try {
            onProgress(10);

            const config = {
                progress: (key, current, total) => {
                    const pct = 10 + (current / total) * 80;
                    onProgress(Math.round(pct));
                },
                output: {
                    format: 'image/png',
                    quality: 0.9
                }
            };

            const blob = await removeBackgroundFn(imageInput, config);
            onProgress(100);
            return blob;

        } catch (error) {
            console.warn('ML background removal failed, using canvas fallback:', error);
        }
    }

    // Fallback to canvas-based removal
    console.log('Using canvas-based background removal');
    onProgress(10);
    return removeBackgroundCanvas(imageInput, onProgress);
}

/**
 * Convert a Blob to a data URL
 * @param {Blob} blob 
 * @returns {Promise<string>}
 */
export function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Load an image from a File
 * @param {File} file 
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
