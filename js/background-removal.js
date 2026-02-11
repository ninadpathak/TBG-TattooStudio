// Background Removal Module
// Uses @imgly/background-removal with robust error handling and fallback

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
            // We use version 1.5.5 which has better model performace
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
 * Remove background from an image
 * @param {File|Blob|string} imageInput - Image file, blob, or data URL
 * @param {Function} onProgress - Progress callback (0-100)
 * @returns {Promise<Blob>} - Processed image as blob with transparent background
 */
export async function removeImageBackground(imageInput, onProgress = () => { }) {
    onProgress(5);

    // Try to initialize if not already
    let libAvailable = false;
    try {
        // Race initialization too, just in case import hangs
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

            // Configuration for better quality
            const config = {
                progress: (key, current, total) => {
                    // Map generic progress to 20-90 range
                    const pct = 20 + (current / total) * 70;
                    onProgress(Math.round(pct));
                },
                output: {
                    format: 'image/png',
                    quality: 0.95
                },
                model: 'medium'
            };

            // Race the actual processing against a 20s timeout
            // If it takes longer than 20s, it's likely stuck or too slow for UX
            const blob = await Promise.race([
                removeBackgroundFn(imageInput, config),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Background removal timed out')), 20000)
                )
            ]);

            onProgress(100);
            return blob;

        } catch (error) {
            console.warn('AI background removal failed/timed out, falling back to canvas:', error);
        }
    } else {
        console.warn('AI library not available or timed out, using canvas fallback');
    }

    // Fallback: Simple Canvas-based removal (white/light background)
    // This is useful for tattoo sheets which often have white backgrounds
    console.log('Falling back to simple white background removal');
    return removeWhiteBackground(imageInput, onProgress);
}

/**
 * Simple canvas-based white/light background removal
 * Optimized for tattoo sketches on white paper
 */
function removeWhiteBackground(imageInput, onProgress) {
    onProgress(50);
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');

            ctx.drawImage(img, 0, 0);
            onProgress(70);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            const threshold = 200; // Threshold for white

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];

                // Check if likely white/paper background
                // We also check for near-neutral colors (grays) which are often paper shadows
                const brightness = (r + g + b) / 3;

                if (brightness > threshold) {
                    // Simple transparency
                    data[i + 3] = 0;
                } else if (brightness > 150) {
                    // Smooth transition for edges
                    // Calculate alpha based on brightness
                    const alpha = 255 - ((brightness - 150) * 2.5);
                    data[i + 3] = Math.min(data[i + 3], alpha);
                }
            }

            ctx.putImageData(imageData, 0, 0);
            onProgress(90);

            canvas.toBlob((blob) => {
                onProgress(100);
                resolve(blob);
            }, 'image/png');
        };

        img.onerror = (e) => reject(new Error('Failed to load image for fallback processing'));

        if (imageInput instanceof File || imageInput instanceof Blob) {
            img.src = URL.createObjectURL(imageInput);
        } else {
            img.src = imageInput;
        }
    });
}

/**
 * Convert a Blob to a data URL
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
