// AI Tattoo Generator & Placer Module
// Uses Gemini API for both tattoo generation and placement

import { creditsManager } from './credits.js';
import { config, isAIAvailable, getAPIEndpoint } from './config.js';

// Tattoo styles
const TATTOO_STYLES = {
    minimalist: 'minimalist line art, simple, clean lines, black ink',
    tribal: 'tribal tattoo design, bold black patterns, polynesian inspired',
    japanese: 'traditional japanese tattoo style, irezumi, detailed',
    watercolor: 'watercolor tattoo style, soft colors, artistic splashes',
    geometric: 'geometric tattoo design, sacred geometry, symmetrical patterns',
    traditional: 'american traditional tattoo style, bold lines, classic'
};

class AIGenerator {
    constructor() {
        this.currentStyle = 'minimalist';
        this.isProcessing = false;
    }

    setStyle(style) {
        if (TATTOO_STYLES[style]) {
            this.currentStyle = style;
        }
    }

    getStyles() {
        return Object.keys(TATTOO_STYLES);
    }

    /**
     * Check if AI features are available
     */
    isAvailable() {
        return isAIAvailable();
    }

    /**
     * Place a tattoo on a body image using Gemini AI
     * @param {string} bodyImageBase64 - Body photo as base64
     * @param {string} tattooImageBase64 - Tattoo image as base64
     * @param {string} placementPrompt - Where to place the tattoo
     * @returns {Promise<{success: boolean, image?: string, error?: string}>}
     */
    async placeTattoo(bodyImageBase64, tattooImageBase64, placementPrompt) {
        if (this.isProcessing) {
            return { success: false, error: 'Processing in progress' };
        }

        if (!creditsManager.hasCredits(1)) {
            creditsManager.showBuyModal();
            return { success: false, error: 'No credits available' };
        }

        this.isProcessing = true;

        try {
            // Use credit
            creditsManager.useCredit(1);

            const endpoint = getAPIEndpoint();

            if (!endpoint) {
                // Fallback: Try direct API call (only works if CORS is disabled or in dev)
                return await this.placeTattooDirectly(bodyImageBase64, tattooImageBase64, placementPrompt);
            }

            // Call the worker proxy
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'place-tattoo',
                    bodyImage: bodyImageBase64,
                    tattooImage: tattooImageBase64,
                    prompt: placementPrompt
                })
            });

            const result = await response.json();

            if (!result.success) {
                creditsManager.addCredits(1); // Refund on failure
                return { success: false, error: result.error || 'AI placement failed' };
            }

            return { success: true, image: result.image };

        } catch (error) {
            console.error('AI placement error:', error);
            creditsManager.addCredits(1); // Refund on failure
            return { success: false, error: error.message || 'AI placement failed' };
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Generate a tattoo from text prompt using Gemini AI
     * @param {string} prompt - Description of the tattoo
     * @returns {Promise<{success: boolean, image?: string, error?: string}>}
     */
    async generateTattoo(prompt) {
        if (this.isProcessing) {
            return { success: false, error: 'Processing in progress' };
        }

        if (!creditsManager.hasCredits(1)) {
            creditsManager.showBuyModal();
            return { success: false, error: 'No credits available' };
        }

        this.isProcessing = true;

        try {
            creditsManager.useCredit(1);

            const endpoint = getAPIEndpoint();

            if (!endpoint) {
                return await this.generateTattooDirectly(prompt);
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'generate-tattoo',
                    prompt: prompt,
                    style: this.currentStyle
                })
            });

            const result = await response.json();

            if (!result.success) {
                creditsManager.addCredits(1);
                return { success: false, error: result.error || 'Generation failed' };
            }

            return { success: true, image: result.image };

        } catch (error) {
            console.error('Generation error:', error);
            creditsManager.addCredits(1);
            return { success: false, error: error.message || 'Generation failed' };
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Direct API call (for development - requires API key in config)
     */
    async placeTattooDirectly(bodyImageBase64, tattooImageBase64, placementPrompt) {
        if (!config.GEMINI_API_KEY) {
            return { success: false, error: 'API not configured. Deploy the Cloudflare Worker and set WORKER_URL in config.js' };
        }

        const systemPrompt = `You are an expert tattoo placement artist. Take the provided body photo and tattoo design, 
and create a realistic composite image where the tattoo appears naturally on the person's skin.

Placement instruction: ${placementPrompt}

Guidelines:
- Make the tattoo look realistic and natural, as if it's an actual tattoo on their skin
- Match the skin tone and lighting conditions
- Preserve the original tattoo design accurately
- Maintain the person's original appearance
- Output only the edited image`;

        try {
            const response = await fetch(
                `${config.GEMINI_API_URL}?key=${config.GEMINI_API_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { text: systemPrompt },
                                { inline_data: { mime_type: 'image/jpeg', data: bodyImageBase64.replace(/^data:image\/\w+;base64,/, '') } },
                                { inline_data: { mime_type: 'image/png', data: tattooImageBase64.replace(/^data:image\/\w+;base64,/, '') } }
                            ]
                        }],
                        generationConfig: {
                            responseModalities: ['IMAGE', 'TEXT'],
                        }
                    }),
                }
            );

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();
            const parts = data.candidates?.[0]?.content?.parts || [];

            for (const part of parts) {
                if (part.inlineData) {
                    return {
                        success: true,
                        image: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
                    };
                }
            }

            return { success: false, error: 'No image in response' };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Direct tattoo generation (for development)
     */
    async generateTattooDirectly(prompt) {
        if (!config.GEMINI_API_KEY) {
            return { success: false, error: 'API not configured. Deploy the Cloudflare Worker and set WORKER_URL in config.js' };
        }

        const styleDesc = TATTOO_STYLES[this.currentStyle];
        const fullPrompt = `Create a tattoo design: ${prompt}. 
Style: ${styleDesc}. 
The design should be on a pure white background, high contrast, suitable as a tattoo stencil.
Output only the tattoo design image.`;

        try {
            const response = await fetch(
                `${config.GEMINI_API_URL}?key=${config.GEMINI_API_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{ text: fullPrompt }]
                        }],
                        generationConfig: {
                            responseModalities: ['IMAGE', 'TEXT'],
                        }
                    }),
                }
            );

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();
            const parts = data.candidates?.[0]?.content?.parts || [];

            for (const part of parts) {
                if (part.inlineData) {
                    return {
                        success: true,
                        image: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
                    };
                }
            }

            return { success: false, error: 'No image in response' };
        } catch (error) {
            throw error;
        }
    }
}

export const aiGenerator = new AIGenerator();
