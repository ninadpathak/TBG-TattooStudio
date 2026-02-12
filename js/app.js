import { CanvasController } from './canvas.js';
import { removeImageBackground, loadImageFromFile } from './background-removal.js';

class TattooTryOnApp {
    constructor() {
        this.previewObjectUrl = null;
        this.elements = this.collectElements();
        this.canvas = new CanvasController(this.elements.mainCanvas, this.elements.canvasWrapper);

        this.canvas.onSelectionChange = (selected) => {
            this.elements.floatingControls.classList.toggle('visible', selected);
        };

        this.canvas.onTattooRemoved = () => {
            this.resetTattooSection();
            this.setStepState(this.elements.stepCard2, 'active');
            this.setStepState(this.elements.stepCard3, 'locked');
            this.updateDownloadState();
            this.resetSliders();
        };

        this.init();
    }

    collectElements() {
        return {
            bodyUploadZone: document.getElementById('bodyUploadZone'),
            bodyImageInput: document.getElementById('bodyImageInput'),
            bodyPreview: document.getElementById('bodyPreview'),

            tattooUploadZone: document.getElementById('tattooUploadZone'),
            tattooImageInput: document.getElementById('tattooImageInput'),
            tattooPreview: document.getElementById('tattooPreview'),

            canvasContainer: document.getElementById('canvasContainer'),
            canvasWrapper: document.getElementById('canvasWrapper'),
            mainCanvas: document.getElementById('mainCanvas'),
            canvasPlaceholder: document.getElementById('canvasPlaceholder'),

            loadingOverlay: document.getElementById('loadingOverlay'),
            loadingText: document.getElementById('loadingText'),

            floatingControls: document.getElementById('floatingControls'),
            opacitySlider: document.getElementById('opacitySlider'),
            opacityValue: document.getElementById('opacityValue'),
            rotationSlider: document.getElementById('rotationSlider'),
            rotationValue: document.getElementById('rotationValue'),
            resetControlsButton: document.getElementById('resetControlsButton'),

            clearButton: document.getElementById('clearButton'),
            downloadButton: document.getElementById('downloadButton'),

            stepCard1: document.getElementById('stepCard1'),
            stepCard2: document.getElementById('stepCard2'),
            stepCard3: document.getElementById('stepCard3'),

            themeToggle: document.getElementById('themeToggle')
        };
    }

    init() {
        this.setupTheme();
        this.bindUploadZone(this.elements.bodyUploadZone, this.elements.bodyImageInput, (file) => this.handleBodyUpload(file));
        this.bindUploadZone(this.elements.tattooUploadZone, this.elements.tattooImageInput, (file) => this.handleTattooUpload(file));
        this.bindActions();
        this.bindControls();
    }

    bindUploadZone(zone, input, onFile) {
        zone.addEventListener('click', () => input.click());

        input.addEventListener('change', (event) => {
            const [file] = event.target.files || [];
            if (file) onFile(file);
        });

        zone.addEventListener('dragover', (event) => {
            event.preventDefault();
            zone.classList.add('drag-active');
        });

        zone.addEventListener('dragleave', () => zone.classList.remove('drag-active'));

        zone.addEventListener('drop', (event) => {
            event.preventDefault();
            zone.classList.remove('drag-active');

            const [file] = event.dataTransfer.files || [];
            if (file) onFile(file);
        });
    }

    bindActions() {
        this.elements.clearButton.addEventListener('click', () => this.resetAll());

        this.elements.downloadButton.addEventListener('click', () => {
            if (!this.canvas.hasContent()) return;

            const link = document.createElement('a');
            link.download = 'tattoo-preview.png';
            link.href = this.canvas.exportImage();
            link.click();
        });
    }

    bindControls() {
        this.elements.opacitySlider.addEventListener('input', (event) => {
            const value = Number(event.target.value);
            this.elements.opacityValue.textContent = `${value}%`;
            this.canvas.setOpacity(value);
        });

        this.elements.rotationSlider.addEventListener('input', (event) => {
            const value = Number(event.target.value);
            this.elements.rotationValue.textContent = `${value}°`;
            this.canvas.setRotation(value);
        });

        this.elements.resetControlsButton.addEventListener('click', () => {
            this.resetSliders();
            this.canvas.setOpacity(100);
            this.canvas.setRotation(0);
        });
    }

    setupTheme() {
        const toggle = this.elements.themeToggle;
        if (!toggle) return;

        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const dark = savedTheme ? savedTheme === 'dark' : prefersDark;

        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
        this.updateThemeIcon(dark);

        toggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
            this.updateThemeIcon(next === 'dark');
        });
    }

    updateThemeIcon(isDark) {
        const icon = this.elements.themeToggle.querySelector('span');
        if (icon) icon.textContent = isDark ? 'light_mode' : 'dark_mode';
    }

    setStepState(card, state) {
        card.classList.remove('active', 'completed', 'locked');
        card.classList.add(state);
    }

    setLoading(visible, text = 'Processing...') {
        this.elements.loadingText.textContent = text;
        this.elements.loadingOverlay.classList.toggle('visible', visible);
    }

    setCanvasReady(ready) {
        this.elements.canvasPlaceholder.style.display = ready ? 'none' : 'flex';
        this.elements.mainCanvas.style.display = ready ? 'block' : 'none';
        this.elements.canvasWrapper.classList.toggle('has-image', ready);
    }

    resetSliders() {
        this.elements.opacitySlider.value = '100';
        this.elements.rotationSlider.value = '0';
        this.elements.opacityValue.textContent = '100%';
        this.elements.rotationValue.textContent = '0°';
    }

    resetTattooSection() {
        if (this.previewObjectUrl) {
            URL.revokeObjectURL(this.previewObjectUrl);
            this.previewObjectUrl = null;
        }
        this.elements.tattooUploadZone.classList.remove('has-image');
        this.elements.tattooPreview.src = '';
        this.elements.tattooImageInput.value = '';
    }

    updateDownloadState() {
        this.elements.downloadButton.disabled = !this.canvas.hasContent();
    }

    async handleBodyUpload(file) {
        try {
            const image = await loadImageFromFile(file);

            this.elements.bodyPreview.src = image.src;
            this.elements.bodyUploadZone.classList.add('has-image');

            this.canvas.setBodyImage(image);
            this.setCanvasReady(true);

            this.setStepState(this.elements.stepCard1, 'completed');
            this.setStepState(this.elements.stepCard2, 'active');
            this.setStepState(this.elements.stepCard3, 'locked');

            this.resetTattooSection();
            this.elements.floatingControls.classList.remove('visible');
            this.resetSliders();
            this.updateDownloadState();
        } catch (error) {
            console.error('Body upload failed:', error);
            alert('Unable to load this photo. Please try a different file.');
        }
    }

    async handleTattooUpload(file) {
        if (!this.canvas.hasContent()) {
            alert('Please upload your photo first.');
            return;
        }

        this.setLoading(true, 'Removing background... 0%');

        try {
            const cleanedBlob = await removeImageBackground(file, (progress) => {
                this.elements.loadingText.textContent = `Removing background... ${Math.round(progress)}%`;
            });

            const image = await loadImageFromFile(cleanedBlob);
            this.resetTattooSection();
            this.previewObjectUrl = URL.createObjectURL(cleanedBlob);
            this.elements.tattooPreview.src = this.previewObjectUrl;
            this.elements.tattooUploadZone.classList.add('has-image');
            this.canvas.setTattooImage(image);

            this.setStepState(this.elements.stepCard2, 'completed');
            this.setStepState(this.elements.stepCard3, 'active');
            this.updateDownloadState();
        } catch (error) {
            console.warn('Background removal failed, using original image:', error);

            const image = await loadImageFromFile(file);
            this.resetTattooSection();
            this.elements.tattooPreview.src = image.src;
            this.elements.tattooUploadZone.classList.add('has-image');
            this.canvas.setTattooImage(image);

            this.setStepState(this.elements.stepCard2, 'completed');
            this.setStepState(this.elements.stepCard3, 'active');
            this.updateDownloadState();
        } finally {
            this.setLoading(false);
        }
    }

    resetAll() {
        this.canvas.clear();

        this.setCanvasReady(false);
        this.resetSliders();
        this.elements.floatingControls.classList.remove('visible');

        this.elements.bodyUploadZone.classList.remove('has-image');
        this.elements.bodyPreview.src = '';
        this.elements.bodyImageInput.value = '';
        this.resetTattooSection();

        this.setStepState(this.elements.stepCard1, 'active');
        this.setStepState(this.elements.stepCard2, 'locked');
        this.setStepState(this.elements.stepCard3, 'locked');

        this.updateDownloadState();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new TattooTryOnApp();
});
