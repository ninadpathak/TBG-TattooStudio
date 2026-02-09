// TattooTryOn - Simplified App
// Direct manipulation instead of sliders

import { CanvasController } from './canvas.js';
import { removeImageBackground, blobToDataURL, loadImageFromFile } from './background-removal.js';

class TattooTryOnApp {
    constructor() {
        this.elements = {
            // Body upload
            bodyUploadZone: document.getElementById('bodyUploadZone'),
            bodyImageInput: document.getElementById('bodyImageInput'),
            bodyPreview: document.getElementById('bodyPreview'),

            // Tattoo upload
            tattooUploadZone: document.getElementById('tattooUploadZone'),
            tattooImageInput: document.getElementById('tattooImageInput'),
            tattooPreview: document.getElementById('tattooPreview'),

            // Canvas
            canvasContainer: document.getElementById('canvasContainer'),
            canvasWrapper: document.getElementById('canvasWrapper'),
            mainCanvas: document.getElementById('mainCanvas'),
            canvasPlaceholder: document.getElementById('canvasPlaceholder'),
            loadingOverlay: document.getElementById('loadingOverlay'),
            loadingText: document.getElementById('loadingText'),

            // Actions
            clearButton: document.getElementById('clearButton'),
            downloadButton: document.getElementById('downloadButton'),

            // Theme
            themeToggle: document.getElementById('themeToggle')
        };

        this.canvas = new CanvasController(
            this.elements.mainCanvas,
            this.elements.canvasContainer
        );

        this.init();
    }

    init() {
        this.setupUploadZones();
        this.setupActions();
        this.setupTheme();
    }

    setupTheme() {
        const toggle = this.elements.themeToggle;
        if (!toggle) return;

        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const savedTheme = localStorage.getItem('theme');

        if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
            document.documentElement.setAttribute('data-theme', 'dark');
            this.updateThemeIcon(true);
        }

        toggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            this.updateThemeIcon(newTheme === 'dark');
        });
    }

    updateThemeIcon(isDark) {
        const icon = this.elements.themeToggle.querySelector('span');
        if (icon) {
            icon.textContent = isDark ? 'light_mode' : 'dark_mode';
        }
    }

    setupUploadZones() {
        this.setupDropZone(
            this.elements.bodyUploadZone,
            this.elements.bodyImageInput,
            this.handleBodyImageUpload.bind(this)
        );

        this.setupDropZone(
            this.elements.tattooUploadZone,
            this.elements.tattooImageInput,
            this.handleTattooImageUpload.bind(this)
        );
    }

    setupDropZone(zone, input, handler) {
        zone.addEventListener('click', () => input.click());

        input.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handler(e.target.files[0]);
            }
        });

        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('drag-active');
        });

        zone.addEventListener('dragleave', () => {
            zone.classList.remove('drag-active');
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('drag-active');
            if (e.dataTransfer.files.length > 0) {
                handler(e.dataTransfer.files[0]);
            }
        });
    }

    async handleBodyImageUpload(file) {
        try {
            const img = await loadImageFromFile(file);

            // Update preview
            this.elements.bodyPreview.src = img.src;
            this.elements.bodyUploadZone.classList.add('has-image');

            // Set on canvas
            this.canvas.setBodyImage(img);

            // Update UI
            this.elements.canvasPlaceholder.style.display = 'none';
            this.elements.mainCanvas.style.display = 'block';
            this.elements.canvasWrapper.classList.add('has-image');

            this.updateDownloadButton();
        } catch (error) {
            console.error('Failed to load body image:', error);
            alert('Failed to load image. Please try another file.');
        }
    }

    async handleTattooImageUpload(file) {
        if (!this.canvas.hasContent()) {
            alert('Please upload your photo first! (Step 1)');
            return;
        }

        try {
            this.showLoading('Removing background...');

            const processedBlob = await removeImageBackground(file, (progress) => {
                this.elements.loadingText.textContent = `Processing... ${Math.round(progress)}%`;
            });

            const dataUrl = await blobToDataURL(processedBlob);

            const img = new Image();
            img.onload = () => {
                this.elements.tattooPreview.src = dataUrl;
                this.elements.tattooUploadZone.classList.add('has-image');
                this.canvas.setTattooImage(img);
                this.hideLoading();
                this.updateDownloadButton();
            };
            img.src = dataUrl;

        } catch (error) {
            console.error('Failed to process tattoo:', error);
            this.hideLoading();

            // Fallback without background removal
            const img = await loadImageFromFile(file);
            this.elements.tattooPreview.src = img.src;
            this.elements.tattooUploadZone.classList.add('has-image');
            this.canvas.setTattooImage(img);
            this.updateDownloadButton();
        }
    }

    setupActions() {
        this.elements.clearButton.addEventListener('click', () => {
            this.canvas.clear();

            // Reset UI
            this.elements.canvasPlaceholder.style.display = 'flex';
            this.elements.mainCanvas.style.display = 'none';
            this.elements.canvasWrapper.classList.remove('has-image');

            this.elements.bodyUploadZone.classList.remove('has-image');
            this.elements.tattooUploadZone.classList.remove('has-image');
            this.elements.bodyPreview.src = '';
            this.elements.tattooPreview.src = '';
            this.elements.bodyImageInput.value = '';
            this.elements.tattooImageInput.value = '';

            this.updateDownloadButton();
        });

        this.elements.downloadButton.addEventListener('click', () => {
            if (!this.canvas.hasContent()) return;

            const dataUrl = this.canvas.exportImage();
            const link = document.createElement('a');
            link.download = 'tattoo-preview.png';
            link.href = dataUrl;
            link.click();
        });
    }

    updateDownloadButton() {
        this.elements.downloadButton.disabled = !this.canvas.hasContent();
    }

    showLoading(text = 'Processing...') {
        this.elements.loadingText.textContent = text;
        this.elements.loadingOverlay.classList.add('visible');
    }

    hideLoading() {
        this.elements.loadingOverlay.classList.remove('visible');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new TattooTryOnApp();
});
