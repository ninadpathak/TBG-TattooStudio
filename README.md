# TattooTryOn

A virtual tattoo try-on website that lets users upload their photo, add tattoo designs, and see how they look - powered by AI.

## Features

### Free Features
- **Photo Upload**: Upload any photo of yourself
- **Tattoo Upload**: Upload existing tattoo designs (background auto-removed)
- **Manual Positioning**: Drag, resize, rotate, and adjust opacity
- **Download**: Save your tattoo preview image

### AI Features (Credit-Based)
- **AI Tattoo Generation**: Generate custom tattoo designs from text prompts
- **AI Placement**: Let AI realistically place tattoos on your body with natural blending

## Quick Start

```bash
# Start local server
npx http-server -p 8080
```

Then open http://localhost:8080

## Setup AI Features

AI features require a Gemini API key and a backend proxy.

### 1. Get Gemini API Key
1. Go to https://aistudio.google.com/apikey
2. Create a new API key

### 2. Deploy Cloudflare Worker

1. Create account at https://dash.cloudflare.com
2. Go to **Workers & Pages** > **Create Worker**
3. Paste the contents of `api/worker.js`
4. Go to **Settings** > **Variables** > Add:
   - Name: `GEMINI_API_KEY`
   - Value: Your API key from step 1
5. Save and Deploy
6. Note your worker URL (e.g., `https://tattoo-api.yourname.workers.dev`)

### 3. Configure Frontend

Edit `js/config.js`:

```javascript
export const config = {
    WORKER_URL: 'https://tattoo-api.yourname.workers.dev',
    // ... rest of config
};
```

## Project Structure

```
TBG - TattooTryOn/
├── index.html              # Main page
├── css/
│   └── styles.css          # Styling
├── js/
│   ├── app.js              # Main application
│   ├── canvas.js           # Canvas manipulation
│   ├── credits.js          # Credit system
│   ├── config.js           # API configuration
│   ├── ai-generator.js     # AI integration
│   └── background-removal.js
└── api/
    └── worker.js           # Cloudflare Worker (deploy separately)
```

## Credits System

- New users get **3 free AI credits**
- Credits stored in localStorage
- Each AI operation uses 1 credit
- To purchase more: Email pankaj@webjournal.in

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JavaScript
- **AI**: Google Gemini 2.5 Flash Image API
- **Backend**: Cloudflare Workers (optional)
- **Background Removal**: `rembg-webgpu` (WebGPU/WASM) with `@imgly/background-removal` and canvas fallback

## License

MIT
