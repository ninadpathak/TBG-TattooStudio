// Configuration
// Update WORKER_URL after deploying your Cloudflare Worker
export const config = {
    // Set to your Cloudflare Worker URL after deployment
    // e.g., 'https://tattoo-api.yourname.workers.dev'
    WORKER_URL: null, // Set this to enable AI features

    // For local development/testing, you can set API key directly (NOT for production!)
    // This is only used if WORKER_URL is null
    GEMINI_API_KEY: null,

    // API endpoints
    GEMINI_API_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',

    // Feature flags
    FEATURES: {
        AI_PLACEMENT: true,    // AI tattoo placement
        AI_GENERATION: true,   // AI tattoo generation
        MANUAL_PLACEMENT: true // Manual drag-drop (always free)
    }
};

/**
 * Check if AI features are available
 */
export function isAIAvailable() {
    return config.WORKER_URL !== null || config.GEMINI_API_KEY !== null;
}

/**
 * Get the API endpoint
 */
export function getAPIEndpoint() {
    if (config.WORKER_URL) {
        return config.WORKER_URL;
    }
    return null;
}
