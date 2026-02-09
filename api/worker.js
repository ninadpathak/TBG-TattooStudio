/**
 * TattooTryOn API Proxy - Cloudflare Worker
 * 
 * This worker proxies requests to the Gemini API, keeping the API key secure.
 * 
 * SETUP:
 * 1. Create a Cloudflare account at https://dash.cloudflare.com
 * 2. Go to Workers & Pages > Create Worker
 * 3. Paste this code
 * 4. Go to Settings > Variables > Add:
 *    - GEMINI_API_KEY: Your Gemini API key from https://aistudio.google.com/apikey
 * 5. Deploy and note the worker URL (e.g., https://tattoo-api.yourname.workers.dev)
 * 6. Update WORKER_URL in your frontend config
 */

const ALLOWED_ORIGINS = [
    'http://localhost:8080',
    'http://localhost:3000',
    'https://your-domain.com', // Replace with your actual domain
];

function corsHeaders(origin) {
    return {
        'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
    };
}

export default {
    async fetch(request, env) {
        const origin = request.headers.get('Origin') || '';

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: corsHeaders(origin),
            });
        }

        // Only allow POST
        if (request.method !== 'POST') {
            return new Response(JSON.stringify({ error: 'Method not allowed' }), {
                status: 405,
                headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
            });
        }

        try {
            const body = await request.json();
            const { action, bodyImage, tattooImage, prompt, style } = body;

            if (!env.GEMINI_API_KEY) {
                return new Response(JSON.stringify({ error: 'API key not configured' }), {
                    status: 500,
                    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
                });
            }

            let result;

            if (action === 'place-tattoo') {
                // AI Tattoo Placement: body image + tattoo image + placement prompt
                result = await placeTattoo(env.GEMINI_API_KEY, bodyImage, tattooImage, prompt);
            } else if (action === 'generate-tattoo') {
                // AI Tattoo Generation: text prompt to tattoo image
                result = await generateTattoo(env.GEMINI_API_KEY, prompt, style);
            } else {
                return new Response(JSON.stringify({ error: 'Invalid action' }), {
                    status: 400,
                    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
                });
            }

            return new Response(JSON.stringify(result), {
                status: result.success ? 200 : 500,
                headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
            });

        } catch (error) {
            console.error('Worker error:', error);
            return new Response(JSON.stringify({ error: error.message || 'Internal error' }), {
                status: 500,
                headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
            });
        }
    },
};

/**
 * Place a tattoo on a body image using Gemini
 */
async function placeTattoo(apiKey, bodyImageBase64, tattooImageBase64, placementPrompt) {
    const systemPrompt = `You are an expert tattoo placement artist. Take the provided body photo and tattoo design, 
and create a realistic composite image where the tattoo appears naturally on the person's skin.

Placement instruction: ${placementPrompt}

Guidelines:
- Make the tattoo look realistic and natural, as if it's an actual tattoo on their skin
- Match the skin tone and lighting conditions
- Preserve the original tattoo design accurately
- Maintain the person's original appearance
- Output only the edited image`;

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent`,
        {
            method: 'POST',
            headers: {
                'x-goog-api-key': apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: systemPrompt },
                        {
                            inline_data: {
                                mime_type: 'image/jpeg',
                                data: bodyImageBase64.replace(/^data:image\/\w+;base64,/, '')
                            }
                        },
                        {
                            inline_data: {
                                mime_type: 'image/png',
                                data: tattooImageBase64.replace(/^data:image\/\w+;base64,/, '')
                            }
                        }
                    ]
                }],
                generationConfig: {
                    responseModalities: ['IMAGE', 'TEXT'],
                }
            }),
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Gemini API error:', errorText);
        return { success: false, error: 'Failed to generate image' };
    }

    const data = await response.json();

    // Extract image from response
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
}

/**
 * Generate a tattoo design from text prompt
 */
async function generateTattoo(apiKey, prompt, style = 'minimalist') {
    const styleDescriptions = {
        minimalist: 'minimalist line art, simple clean lines, black ink tattoo design',
        tribal: 'tribal tattoo design, bold black patterns, polynesian inspired',
        japanese: 'traditional japanese irezumi style tattoo, detailed',
        watercolor: 'watercolor tattoo style, soft colors, artistic splashes',
        geometric: 'geometric tattoo design, sacred geometry, symmetrical',
        traditional: 'american traditional tattoo style, bold lines, classic',
    };

    const fullPrompt = `Create a tattoo design: ${prompt}. 
Style: ${styleDescriptions[style] || styleDescriptions.minimalist}. 
The design should be on a pure white background, high contrast, suitable as a tattoo stencil.
Output only the tattoo design image.`;

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent`,
        {
            method: 'POST',
            headers: {
                'x-goog-api-key': apiKey,
                'Content-Type': 'application/json',
            },
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
        const errorText = await response.text();
        console.error('Gemini API error:', errorText);
        return { success: false, error: 'Failed to generate tattoo' };
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
}
