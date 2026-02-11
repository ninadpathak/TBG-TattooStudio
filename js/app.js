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

            // Floating Controls
            floatingControls: document.getElementById('floatingControls'),
            opacitySlider: document.getElementById('opacitySlider'),
            opacityValue: document.getElementById('opacityValue'),
            rotationSlider: document.getElementById('rotationSlider'),
            rotationValue: document.getElementById('rotationValue'),

            // Actions
            clearButton: document.getElementById('clearButton'),
            downloadButton: document.getElementById('downloadButton'),
            resetControlsButton: document.getElementById('resetControlsButton'),

            // Step cards
            stepCard1: document.getElementById('stepCard1'),
            stepCard2: document.getElementById('stepCard2'),
            stepCard3: document.getElementById('stepCard3'),

            // Theme
            themeToggle: document.getElementById('themeToggle')
        };

        this.canvas = new CanvasController(
            this.elements.mainCanvas,
            this.elements.canvasContainer
        );

        // Setup canvas callbacks
        this.canvas.onSelectionChange = (isSelected) => {
            this.toggleFloatingControls(isSelected);
        };

        this.canvas.onTattooRemoved = () => {
            this.handleTattooRemoved();
        };

        this.init();
    }

    init() {
        this.setupUploadZones();
        this.setupActions();
        this.setupFloatingControls();
        this.setupTheme();
    }

    // Step progression: 'active' | 'completed' | 'locked'
    setStepState(card, state) {
        if (!card) return;
        card.classList.remove('active', 'completed', 'locked');
        card.classList.add(state);
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

            // Step progression: step 1 done, step 2 active
            this.setStepState(this.elements.stepCard1, 'completed');
            this.setStepState(this.elements.stepCard2, 'active');

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

                // Step progression: step 2 done, step 3 active
                this.setStepState(this.elements.stepCard2, 'completed');
                this.setStepState(this.elements.stepCard3, 'active');

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

            // Step progression even on fallback
            this.setStepState(this.elements.stepCard2, 'completed');
            this.setStepState(this.elements.stepCard3, 'active');

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

            // Reset step progression
            this.setStepState(this.elements.stepCard1, 'active');
            this.setStepState(this.elements.stepCard2, 'locked');
            this.setStepState(this.elements.stepCard3, 'locked');

            // Hide floating controls
            this.toggleFloatingControls(false);
            this.resetFloatingControls();

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

        if (this.elements.resetControlsButton) {
            this.elements.resetControlsButton.addEventListener('click', () => {
                this.resetFloatingControls();
                this.canvas.setOpacity(100);
                this.canvas.setRotation(0);
            });
        }
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

    setupFloatingControls() {
        const { opacitySlider, opacityValue, rotationSlider, rotationValue } = this.elements;

        if (opacitySlider) {
            opacitySlider.addEventListener('input', (e) => {
                const value = e.target.value;
                opacityValue.textContent = `${value}%`;
                this.canvas.setOpacity(value);
            });
        }

        if (rotationSlider) {
            rotationSlider.addEventListener('input', (e) => {
                const value = e.target.value;
                rotationValue.textContent = `${value}°`;
                this.canvas.setRotation(value);
            });
        }
    }

    toggleFloatingControls(show) {
        if (this.elements.floatingControls) {
            this.elements.floatingControls.classList.toggle('visible', show);
        }
    }

    handleTattooRemoved() {
        // Reset tattoo upload UI
        this.elements.tattooUploadZone.classList.remove('has-image');
        this.elements.tattooPreview.src = '';
        this.elements.tattooImageInput.value = '';

        // Reset step progression
        this.setStepState(this.elements.stepCard2, 'active');
        this.setStepState(this.elements.stepCard3, 'locked');

        // Hide floating controls
        this.toggleFloatingControls(false);
        this.resetFloatingControls();

        this.updateDownloadButton();
    }

    resetFloatingControls() {
        if (this.elements.opacitySlider) {
            this.elements.opacitySlider.value = 100;
            this.elements.opacityValue.textContent = '100%';
        }
        if (this.elements.rotationSlider) {
            this.elements.rotationSlider.value = 0;
            this.elements.rotationValue.textContent = '0°';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new TattooTryOnApp();
});
