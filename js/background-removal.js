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
 * Calculate color distance for better edge detection
 */
function colorDistance(r1, g1, b1, r2, g2, b2) {
    return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/**
 * Check if a color is likely background (white/light/gray)
 */
function isBackgroundColor(r, g, b, threshold = 200) {
    // Brightness-based detection
    const brightness = (r + g + b) / 3;
    
    // High brightness = likely background
    if (brightness > threshold) return true;
    
    // Near-grayscale (all channels similar) with high values
    const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
    if (brightness > 180 && maxDiff < 30) return true;
    
    return false;
}

/**
 * Enhanced canvas-based background removal with edge feathering
 */
function removeBackgroundEnhanced(imageData, threshold = 200, featherRadius = 2) {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    
    // First pass: detect background pixels
    const alphaMap = new Uint8Array(width * height);
    
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const idx = i / 4;
        
        if (isBackgroundColor(r, g, b, threshold)) {
            // Calculate alpha based on how close to pure white
            const brightness = (r + g + b) / 3;
            const closeness = (brightness - threshold) / (255 - threshold);
            alphaMap[idx] = Math.max(0, 255 - (closeness * 255));
        } else {
            alphaMap[idx] = 255;
        }
    }
    
    // Second pass: edge feathering (smooth transitions at edges)
    if (featherRadius > 0) {
        const featheredAlpha = new Uint8Array(alphaMap);
        
        for (let y = featherRadius; y < height - featherRadius; y++) {
            for (let x = featherRadius; x < width - featherRadius; x++) {
                const idx = y * width + x;
                
                // Only process edge pixels
                if (alphaMap[idx] > 0 && alphaMap[idx] < 255) {
                    let totalAlpha = 0;
                    let count = 0;
                    
                    // Sample surrounding pixels
                    for (let dy = -featherRadius; dy <= featherRadius; dy++) {
                        for (let dx = -featherRadius; dx <= featherRadius; dx++) {
                            const sampleIdx = (y + dy) * width + (x + dx);
                            totalAlpha += alphaMap[sampleIdx];
                            count++;
                        }
                    }
                    
                    featheredAlpha[idx] = Math.round(totalAlpha / count);
                }
            }
        }
        
        // Apply feathered alpha
        for (let i = 0; i < data.length; i += 4) {
            const idx = i / 4;
            data[i + 3] = featheredAlpha[idx];
        }
    } else {
        // Apply without feathering
        for (let i = 0; i < data.length; i += 4) {
            data[i + 3] = alphaMap[i / 4];
        }
    }
    
    return imageData;
}

/**
 * Simple canvas-based white/light background removal
 * Works well for tattoo images with white or light backgrounds
 */
function removeWhiteBackground(imageData, threshold = 200) {
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
        else if (r > 180 && g > 180 && b > 180) {
            // Fade based on how close to white
            const brightness = (r + g + b) / 3;
            const alpha = Math.max(0, 255 - ((brightness - 180) * 2.5));
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

            // Get image data and remove white background with enhanced algorithm
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            
            // Use enhanced removal with feathering for smoother edges
            removeBackgroundEnhanced(imageData, 200, 2);
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

    // Fallback to canvas-based removal with enhanced algorithm
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
