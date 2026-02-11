// Background Removal Module
// Uses @imgly/background-removal with SMART FALLBACKS for tattoos/sketches

let removeBackgroundFn = null;
let isInitialized = false;
let initializationPromise = null;

// Initialize the background removal library
async function initBackgroundRemoval() {
    if (isInitialized) return true;
    if (initializationPromise) return initializationPromise;

    initializationPromise = (async () => {
        try {
            console.log('Initializing background removal library...');
            // Load the library from CDN
            const module = await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/+esm');
            removeBackgroundFn = module.removeBackground;
            isInitialized = true;
            console.log('Background removal library loaded successfully');
            return true;
        } catch (error) {
            console.warn('Background removal library failed to load:', error);
            initializationPromise = null;
            return false;
        }
    })();

    return initializationPromise;
}

/**
 * Remove background from an image with smart fallback
 */
export async function removeImageBackground(imageInput, onProgress = () => { }) {
    onProgress(5);

    // Try to initialize if not already - 5s timeout
    let libAvailable = false;
    try {
        libAvailable = await Promise.race([
            initBackgroundRemoval(),
            new Promise(resolve => setTimeout(() => resolve(false), 5000))
        ]);
    } catch (e) {
        console.warn('Initialization failed or timed out:', e);
    }

    if (libAvailable && removeBackgroundFn) {
        try {
            onProgress(15);
            console.log('Starting background removal with AI model...');

            const config = {
                progress: (key, current, total) => {
                    // Fix jumping progress: separate fetch vs compute
                    // key is typically "fetch:url" or "compute:inference"
                    let base = 20;
                    let span = 70;
                    let p = 0;

                    if (total > 0) {
                        p = current / total;
                    }

                    if (key && key.includes('fetch')) {
                        // Fetching models (20-50%)
                        base = 20;
                        span = 30;
                    } else {
                        // processing (50-95%)
                        base = 50;
                        span = 45;
                    }

                    onProgress(Math.round(base + p * span));
                },
                output: { format: 'image/png', quality: 0.95 },
                model: 'medium'
            };

            // Race processing against 15s timeout stuck
            const blob = await Promise.race([
                removeBackgroundFn(imageInput, config),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('AI processing timed out')), 15000)
                )
            ]);

            // Check if result is useful (not empty)
            const bitmap = await createImageBitmap(blob);
            if (!isBitmapEmpty(bitmap)) {
                onProgress(100);
                console.log('AI background removal successful');
                return blob;
            } else {
                console.warn('AI removed everything (likely sketch), falling back to Sketch Mode');
            }

        } catch (error) {
            console.warn('AI background removal failed/timed out, falling back to Sketch Mode:', error);
        }
    } else {
        console.warn('AI library not available or timed out, falling back to Sketch Mode');
    }

    // Fallback: Smart Sketch Extraction
    // Ideal for tattoos on white paper
    console.log("Using Smart Sketch Fallback");
    return removeSketchBackground(imageInput, onProgress);
}

/**
 * Checks if the resulting bitmap is completely transparent (failed removal)
 */
function isBitmapEmpty(imageBitmap) {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(imageBitmap, 0, 0, 100, 100);
    const data = ctx.getImageData(0, 0, 100, 100).data;

    // Check alpha channel of updated image
    for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 20) return false; // Found something visible
    }
    return true; // Completely empty/transparent
}

/**
 * Smart Sketch Extraction (Luminance Keying)
 * Preserves ink, removes paper.
 */
function removeSketchBackground(imageInput, onProgress) {
    onProgress(50);
    console.log("Processing with Sketch Extraction...");

    return new Promise((resolve, reject) => {
        loadImageFromFile(imageInput).then(img => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });

            ctx.drawImage(img, 0, 0);
            onProgress(70);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            // Luminance to Alpha
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];

                // Calculate Luminance (standard)
                const luma = 0.299 * r + 0.587 * g + 0.114 * b;

                // Alpha calculation:
                // White (255) -> 0 Alpha
                // Black (0) -> 255 Alpha
                let alpha = 255 - luma;

                // Contrast stretch to clean up "dirty white" paper
                // If luma > 230 (light gray paper), make it transparent
                // If luma < 50 (dark ink), make it opaque
                if (luma > 230) {
                    alpha = 0;
                } else if (luma < 50) {
                    alpha = 255;
                } else {
                    // Clean edges slightly
                    // alpha = alpha; 
                }

                // Preserve original RGB, update Alpha
                // We keep the existing alpha into account in case input was png
                data[i + 3] = Math.max(0, Math.min(255, alpha));
            }

            ctx.putImageData(imageData, 0, 0);
            onProgress(90);

            canvas.toBlob((blob) => {
                onProgress(100);
                resolve(blob);
            }, 'image/png');

        }).catch(e => reject(new Error('Failed to load image for fallback')));
    });
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
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        } else if (typeof file === 'string') {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = file;
        } else {
            reject(new Error("Invalid input to loadImageFromFile"));
        }
    });
}
