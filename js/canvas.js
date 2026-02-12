// Canvas Controller - layer-based interaction model
// Supports moving/resizing both body photo and tattoo.

export class CanvasController {
    constructor(canvasElement, containerElement) {
        this.canvas = canvasElement;
        this.container = containerElement;
        this.ctx = canvasElement.getContext('2d');

        this.bodyImage = null;
        this.tattooImage = null;

        this.body = {
            x: 0,
            y: 0,
            scale: 1,
            width: 0,
            height: 0
        };

        this.tattoo = {
            x: 0,
            y: 0,
            scale: 1,
            rotation: 0,
            opacity: 1,
            width: 0,
            height: 0
        };

        this.state = {
            selectedLayer: null, // 'body' | 'tattoo' | null
            dragging: false,
            resizing: false,
            dragStart: { x: 0, y: 0 },
            layerStart: { x: 0, y: 0, scale: 1 }
        };

        this.onSelectionChange = null;
        this.onTattooRemoved = null;

        this.logoImage = new Image();
        this.logoImage.src = 'assets/images/logo.png';
        this.toneSampleCanvas = document.createElement('canvas');
        this.toneSampleCanvas.width = 32;
        this.toneSampleCanvas.height = 32;
        this.toneSampleCtx = this.toneSampleCanvas.getContext('2d', { willReadFrequently: true });
        this.integrationCanvas = document.createElement('canvas');
        this.integrationCtx = this.integrationCanvas.getContext('2d', { willReadFrequently: true });
        this.integrationCache = { key: '', map: null, lightX: -0.2, lightY: -0.8, luminance: 0.56 };

        this.initCanvasSize();
        this.attachEvents();
    }

    initCanvasSize() {
        const rect = this.container.getBoundingClientRect();
        const width = Math.max(900, Math.floor(rect.width || 900));
        const height = Math.max(560, Math.floor(rect.height || window.innerHeight * 0.72));

        this.canvas.width = width;
        this.canvas.height = height;

        this.canvas.style.width = 'auto';
        this.canvas.style.height = 'auto';
        this.canvas.style.maxWidth = '100%';
        this.canvas.style.maxHeight = '100%';
        this.canvas.style.touchAction = 'none';
        this.canvas.style.cursor = 'default';
    }

    resizeCanvasToContainer() {
        const oldWidth = this.canvas.width;
        const oldHeight = this.canvas.height;

        const rect = this.container.getBoundingClientRect();
        const nextWidth = Math.max(900, Math.floor(rect.width || 900));
        const nextHeight = Math.max(560, Math.floor(rect.height || window.innerHeight * 0.72));

        if (nextWidth === oldWidth && nextHeight === oldHeight) return;

        const sx = nextWidth / oldWidth;
        const sy = nextHeight / oldHeight;
        const scaleAdjust = Math.min(sx, sy);

        this.canvas.width = nextWidth;
        this.canvas.height = nextHeight;

        if (this.bodyImage) {
            this.body.x *= sx;
            this.body.y *= sy;
            this.body.scale *= scaleAdjust;
        }

        if (this.tattooImage) {
            this.tattoo.x *= sx;
            this.tattoo.y *= sy;
            this.tattoo.scale *= scaleAdjust;
        }

        this.render();
    }

    attachEvents() {
        this.canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));
        window.addEventListener('pointermove', this.onPointerMove.bind(this));
        window.addEventListener('pointerup', this.onPointerUp.bind(this));
        window.addEventListener('resize', this.resizeCanvasToContainer.bind(this));

        this.canvas.addEventListener('touchstart', (event) => event.preventDefault(), { passive: false });
        this.canvas.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });

        document.addEventListener('keydown', (event) => {
            if (this.state.selectedLayer !== 'tattoo' || !this.tattooImage) return;

            if (event.key === 'Delete' || event.key === 'Backspace') {
                event.preventDefault();
                this.removeTattoo();
            }
        });
    }

    toCanvasPoint(event) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top) * scaleY
        };
    }

    setSelectedLayer(layer) {
        if (this.state.selectedLayer === layer) return;

        this.state.selectedLayer = layer;

        if (this.onSelectionChange) {
            this.onSelectionChange(layer === 'tattoo');
        }

        this.render();
    }

    getLayerTransform(layerName) {
        return layerName === 'body' ? this.body : this.tattoo;
    }

    hasLayer(layerName) {
        return layerName === 'body' ? Boolean(this.bodyImage) : Boolean(this.tattooImage);
    }

    getLayerBounds(layerName) {
        if (!this.hasLayer(layerName)) return null;

        const t = this.getLayerTransform(layerName);
        const width = t.width * t.scale;
        const height = t.height * t.scale;

        const x = t.x - (width / 2);
        const y = t.y - (height / 2);

        return {
            x,
            y,
            width,
            height,
            corners: [
                { x, y, type: 'nw' },
                { x: x + width, y, type: 'ne' },
                { x: x + width, y: y + height, type: 'se' },
                { x, y: y + height, type: 'sw' }
            ]
        };
    }

    isInsideLayer(layerName, x, y) {
        const bounds = this.getLayerBounds(layerName);
        if (!bounds) return false;

        return (
            x >= bounds.x &&
            x <= bounds.x + bounds.width &&
            y >= bounds.y &&
            y <= bounds.y + bounds.height
        );
    }

    getHandleAt(layerName, x, y) {
        if (this.state.selectedLayer !== layerName) return null;

        const bounds = this.getLayerBounds(layerName);
        if (!bounds) return null;

        const size = 12;

        for (const corner of bounds.corners) {
            if (
                x >= corner.x - size &&
                x <= corner.x + size &&
                y >= corner.y - size &&
                y <= corner.y + size
            ) {
                return corner.type;
            }
        }

        return null;
    }

    onPointerDown(event) {
        if (!this.bodyImage) return;

        const point = this.toCanvasPoint(event);

        if (this.state.selectedLayer) {
            const selectedHandle = this.getHandleAt(this.state.selectedLayer, point.x, point.y);
            if (selectedHandle) {
                this.state.resizing = true;
                this.state.dragStart = point;
                const t = this.getLayerTransform(this.state.selectedLayer);
                this.state.layerStart = { x: t.x, y: t.y, scale: t.scale };
                this.canvas.style.cursor = 'nwse-resize';
                this.canvas.setPointerCapture(event.pointerId);
                return;
            }
        }

        if (this.tattooImage && this.isInsideLayer('tattoo', point.x, point.y)) {
            this.setSelectedLayer('tattoo');
            this.state.dragging = true;
            this.state.dragStart = point;
            this.state.layerStart = { x: this.tattoo.x, y: this.tattoo.y, scale: this.tattoo.scale };
            this.canvas.style.cursor = 'grabbing';
            this.canvas.setPointerCapture(event.pointerId);
            return;
        }

        if (this.bodyImage && this.isInsideLayer('body', point.x, point.y)) {
            this.setSelectedLayer('body');
            this.state.dragging = true;
            this.state.dragStart = point;
            this.state.layerStart = { x: this.body.x, y: this.body.y, scale: this.body.scale };
            this.canvas.style.cursor = 'grabbing';
            this.canvas.setPointerCapture(event.pointerId);
            return;
        }

        this.setSelectedLayer(null);
        this.canvas.style.cursor = 'default';
    }

    onPointerMove(event) {
        if (!this.bodyImage) return;

        const point = this.toCanvasPoint(event);
        const layer = this.state.selectedLayer;

        if (this.state.dragging && layer) {
            const t = this.getLayerTransform(layer);
            t.x = this.state.layerStart.x + (point.x - this.state.dragStart.x);
            t.y = this.state.layerStart.y + (point.y - this.state.dragStart.y);
            this.render();
            return;
        }

        if (this.state.resizing && layer) {
            const t = this.getLayerTransform(layer);
            const startDistance = Math.hypot(
                this.state.dragStart.x - t.x,
                this.state.dragStart.y - t.y
            );
            const currentDistance = Math.hypot(point.x - t.x, point.y - t.y);

            if (startDistance > 0) {
                const nextScale = this.state.layerStart.scale * (currentDistance / startDistance);
                t.scale = Math.min(8, Math.max(0.05, nextScale));
                this.render();
            }
            return;
        }

        if (layer && this.getHandleAt(layer, point.x, point.y)) {
            this.canvas.style.cursor = 'nwse-resize';
            return;
        }

        if (this.tattooImage && this.isInsideLayer('tattoo', point.x, point.y)) {
            this.canvas.style.cursor = 'grab';
            return;
        }

        if (this.bodyImage && this.isInsideLayer('body', point.x, point.y)) {
            this.canvas.style.cursor = 'grab';
            return;
        }

        this.canvas.style.cursor = 'default';
    }

    onPointerUp() {
        this.state.dragging = false;
        this.state.resizing = false;

        if (!this.state.selectedLayer) {
            this.canvas.style.cursor = 'default';
        } else {
            this.canvas.style.cursor = 'grab';
        }
    }

    setBodyImage(image) {
        this.bodyImage = image;
        this.tattooImage = null;

        this.resizeCanvasToContainer();

        this.body.width = image.width;
        this.body.height = image.height;
        this.body.scale = Math.min(
            (this.canvas.width * 0.82) / image.width,
            (this.canvas.height * 0.82) / image.height
        );
        this.body.x = this.canvas.width / 2;
        this.body.y = this.canvas.height / 2;

        this.setSelectedLayer('body');
    }

    setTattooImage(image) {
        if (!this.bodyImage) return;

        this.tattooImage = image;
        this.tattoo.width = image.width;
        this.tattoo.height = image.height;

        const bodyDisplayWidth = this.body.width * this.body.scale;
        this.tattoo.scale = Math.max(0.08, (bodyDisplayWidth * 0.28) / image.width);
        this.tattoo.rotation = 0;
        this.tattoo.opacity = 1;
        this.tattoo.x = this.body.x;
        this.tattoo.y = this.body.y;

        this.setSelectedLayer('tattoo');
    }

    setOpacity(value) {
        this.tattoo.opacity = Math.max(0.1, Math.min(1, Number(value) / 100));
        this.render();
    }

    setRotation(value) {
        this.tattoo.rotation = (Number(value) * Math.PI) / 180;
        this.render();
    }

    removeTattoo() {
        this.tattooImage = null;
        if (this.state.selectedLayer === 'tattoo') {
            this.setSelectedLayer('body');
        } else {
            this.render();
        }

        if (this.onTattooRemoved) {
            this.onTattooRemoved();
        }
    }

    clear() {
        this.bodyImage = null;
        this.tattooImage = null;
        this.setSelectedLayer(null);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.canvas.style.cursor = 'default';
    }

    hasContent() {
        return Boolean(this.bodyImage);
    }

    exportImage() {
        if (!this.bodyImage) {
            return this.canvas.toDataURL('image/png');
        }

        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = this.body.width;
        exportCanvas.height = this.body.height;
        const exportCtx = exportCanvas.getContext('2d');

        exportCtx.drawImage(this.bodyImage, 0, 0, this.body.width, this.body.height);

        if (this.tattooImage) {
            const tattooForExport = this.getTattooTransformForImageSpace();
            this.drawTattooLayer(exportCtx, this.tattooImage, tattooForExport, {
                rotation: this.tattoo.rotation,
                opacity: this.tattoo.opacity,
                bodyRef: {
                    x: this.body.width / 2,
                    y: this.body.height / 2,
                    width: this.body.width,
                    height: this.body.height,
                    scale: 1
                }
            });
        }

        this.drawWatermark(exportCtx, exportCanvas.width, exportCanvas.height);

        return exportCanvas.toDataURL('image/png');
    }

    getTattooTransformForImageSpace() {
        const safeBodyScale = this.body.scale > 0 ? this.body.scale : 1;
        return {
            x: ((this.tattoo.x - this.body.x) / safeBodyScale) + (this.body.width / 2),
            y: ((this.tattoo.y - this.body.y) / safeBodyScale) + (this.body.height / 2),
            width: this.tattoo.width,
            height: this.tattoo.height,
            scale: this.tattoo.scale / safeBodyScale
        };
    }

    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    getSkinToneStats(transform, bodyRef) {
        if (!this.bodyImage || !this.toneSampleCtx || !bodyRef || bodyRef.scale <= 0) {
            return { luminance: 0.58, saturation: 0.3, warmth: 0.08 };
        }

        const centerX = ((transform.x - bodyRef.x) / bodyRef.scale) + (bodyRef.width / 2);
        const centerY = ((transform.y - bodyRef.y) / bodyRef.scale) + (bodyRef.height / 2);
        const sampleSize = this.clamp(Math.round(Math.min(bodyRef.width, bodyRef.height) * 0.12), 36, 220);

        const sx = this.clamp(Math.round(centerX - sampleSize / 2), 0, Math.max(0, this.bodyImage.width - 1));
        const sy = this.clamp(Math.round(centerY - sampleSize / 2), 0, Math.max(0, this.bodyImage.height - 1));
        const sw = this.clamp(sampleSize, 1, this.bodyImage.width - sx);
        const sh = this.clamp(sampleSize, 1, this.bodyImage.height - sy);

        this.toneSampleCtx.clearRect(0, 0, this.toneSampleCanvas.width, this.toneSampleCanvas.height);
        this.toneSampleCtx.drawImage(
            this.bodyImage,
            sx,
            sy,
            sw,
            sh,
            0,
            0,
            this.toneSampleCanvas.width,
            this.toneSampleCanvas.height
        );

        const { data } = this.toneSampleCtx.getImageData(0, 0, this.toneSampleCanvas.width, this.toneSampleCanvas.height);
        let sumL = 0;
        let sumSat = 0;
        let sumWarm = 0;
        let count = 0;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i] / 255;
            const g = data[i + 1] / 255;
            const b = data[i + 2] / 255;
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const l = (max + min) / 2;
            const sat = max === min ? 0 : (max - min) / (1 - Math.abs((2 * l) - 1));
            const warm = r - b;

            sumL += l;
            sumSat += sat;
            sumWarm += warm;
            count += 1;
        }

        if (!count) {
            return { luminance: 0.58, saturation: 0.3, warmth: 0.08 };
        }

        return {
            luminance: sumL / count,
            saturation: sumSat / count,
            warmth: sumWarm / count
        };
    }

    getTattooToneFilters(transform, bodyRef) {
        const stats = this.getSkinToneStats(transform, bodyRef);
        const brightness = this.clamp(0.82 + (stats.luminance * 0.33) + (stats.warmth * 0.08), 0.78, 1.12);
        const contrast = this.clamp(1.03 + ((0.56 - stats.luminance) * 0.22), 0.92, 1.18);
        const saturation = this.clamp(0.64 + (stats.saturation * 0.46), 0.58, 1.06);
        return { brightness, contrast, saturation };
    }

    getBodySamplingRect(transform, bodyRef) {
        const width = transform.width * transform.scale;
        const height = transform.height * transform.scale;
        const safeScale = bodyRef && bodyRef.scale > 0 ? bodyRef.scale : 1;

        const centerX = ((transform.x - bodyRef.x) / safeScale) + (bodyRef.width / 2);
        const centerY = ((transform.y - bodyRef.y) / safeScale) + (bodyRef.height / 2);
        const sampleWidth = Math.max(1, width / safeScale);
        const sampleHeight = Math.max(1, height / safeScale);

        const rawX = centerX - (sampleWidth / 2);
        const rawY = centerY - (sampleHeight / 2);

        const sx = this.clamp(rawX, 0, Math.max(0, this.bodyImage.width - 1));
        const sy = this.clamp(rawY, 0, Math.max(0, this.bodyImage.height - 1));
        const sw = this.clamp(sampleWidth, 1, this.bodyImage.width - sx);
        const sh = this.clamp(sampleHeight, 1, this.bodyImage.height - sy);

        return { sx, sy, sw, sh, width, height };
    }

    getIntegrationMap(transform, bodyRef) {
        if (!this.bodyImage || !this.integrationCtx || !bodyRef || bodyRef.scale <= 0) {
            return this.integrationCache;
        }

        const bodyRect = this.getBodySamplingRect(transform, bodyRef);
        const mapWidth = this.clamp(Math.round(bodyRect.width / 6), 44, 112);
        const mapHeight = this.clamp(Math.round(bodyRect.height / 6), 44, 112);
        const key = [
            Math.round(bodyRect.sx / 6),
            Math.round(bodyRect.sy / 6),
            Math.round(bodyRect.sw / 6),
            Math.round(bodyRect.sh / 6),
            mapWidth,
            mapHeight
        ].join(':');

        if (this.integrationCache.key === key && this.integrationCache.map) {
            return this.integrationCache;
        }

        this.integrationCanvas.width = mapWidth;
        this.integrationCanvas.height = mapHeight;
        this.integrationCtx.clearRect(0, 0, mapWidth, mapHeight);
        this.integrationCtx.drawImage(
            this.bodyImage,
            bodyRect.sx,
            bodyRect.sy,
            bodyRect.sw,
            bodyRect.sh,
            0,
            0,
            mapWidth,
            mapHeight
        );

        const source = this.integrationCtx.getImageData(0, 0, mapWidth, mapHeight);
        const pixelCount = mapWidth * mapHeight;
        const luma = new Float32Array(pixelCount);
        const output = this.integrationCtx.createImageData(mapWidth, mapHeight);

        let left = 0;
        let right = 0;
        let top = 0;
        let bottom = 0;
        let avgLum = 0;

        for (let y = 0; y < mapHeight; y += 1) {
            for (let x = 0; x < mapWidth; x += 1) {
                const idx = (y * mapWidth) + x;
                const i4 = idx * 4;
                const r = source.data[i4] / 255;
                const g = source.data[i4 + 1] / 255;
                const b = source.data[i4 + 2] / 255;
                const lum = (r * 0.299) + (g * 0.587) + (b * 0.114);
                luma[idx] = lum;
                avgLum += lum;

                if (x < mapWidth / 2) left += lum; else right += lum;
                if (y < mapHeight / 2) top += lum; else bottom += lum;
            }
        }

        avgLum /= pixelCount;
        const lightXRaw = right - left;
        const lightYRaw = bottom - top;
        const mag = Math.hypot(lightXRaw, lightYRaw) || 1;
        const lightX = lightXRaw / mag;
        const lightY = lightYRaw / mag;

        for (let y = 1; y < mapHeight - 1; y += 1) {
            for (let x = 1; x < mapWidth - 1; x += 1) {
                const idx = (y * mapWidth) + x;
                const i4 = idx * 4;
                const dx = luma[idx + 1] - luma[idx - 1];
                const dy = luma[idx + mapWidth] - luma[idx - mapWidth];
                const edge = this.clamp((Math.abs(dx) + Math.abs(dy)) * 2.4, 0, 1);
                const shadow = this.clamp((0.44 - luma[idx]) * 1.25, 0, 0.65);
                const alpha = Math.round(this.clamp((edge * 0.8) + (shadow * 0.45), 0, 1) * 255);
                output.data[i4] = 0;
                output.data[i4 + 1] = 0;
                output.data[i4 + 2] = 0;
                output.data[i4 + 3] = alpha;
            }
        }

        this.integrationCtx.putImageData(output, 0, 0);

        this.integrationCache = {
            key,
            map: this.integrationCanvas,
            lightX,
            lightY,
            luminance: avgLum
        };

        return this.integrationCache;
    }

    drawTattooLayer(ctx, image, transform, extra = null) {
        if (!image) return;

        const width = transform.width * transform.scale;
        const height = transform.height * transform.scale;
        const rotation = extra && typeof extra.rotation === 'number' ? extra.rotation : 0;
        const opacity = extra && typeof extra.opacity === 'number' ? extra.opacity : 1;
        const bodyRef = extra && extra.bodyRef ? extra.bodyRef : this.body;
        const filters = this.getTattooToneFilters(transform, bodyRef);
        const integration = this.getIntegrationMap(transform, bodyRef);

        ctx.save();
        ctx.translate(transform.x, transform.y);
        ctx.rotate(rotation);

        // Feather pass: slight blur to avoid cutout edges.
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = opacity * 0.22;
        ctx.filter = `blur(0.9px) brightness(${(filters.brightness * 1.02).toFixed(3)}) saturate(${(filters.saturation * 0.95).toFixed(3)})`;
        ctx.drawImage(image, -width / 2, -height / 2, width, height);
        ctx.restore();

        // Main ink pass: multiplies with skin tone.
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = opacity * 0.9;
        ctx.filter = `contrast(${filters.contrast.toFixed(3)}) brightness(${filters.brightness.toFixed(3)}) saturate(${filters.saturation.toFixed(3)})`;
        ctx.drawImage(image, -width / 2, -height / 2, width, height);
        ctx.restore();

        // Light interaction pass: subtle highlight integration with skin.
        ctx.save();
        ctx.globalCompositeOperation = 'soft-light';
        ctx.globalAlpha = opacity * 0.24;
        ctx.filter = `contrast(${(filters.contrast * 0.97).toFixed(3)}) brightness(${Math.min(1.2, filters.brightness + 0.06).toFixed(3)}) saturate(${(filters.saturation * 0.92).toFixed(3)})`;
        ctx.drawImage(image, -width / 2, -height / 2, width, height);
        ctx.restore();

        if (integration && integration.map) {
            const lx = integration.lightX || -0.2;
            const ly = integration.lightY || -0.8;

            // Lighting pass: directional light modulation from underlying skin.
            ctx.save();
            ctx.globalCompositeOperation = 'soft-light';
            ctx.globalAlpha = opacity * 0.28;
            const gradient = ctx.createLinearGradient(
                (-width / 2) - (lx * width * 0.35),
                (-height / 2) - (ly * height * 0.35),
                (width / 2) + (lx * width * 0.35),
                (height / 2) + (ly * height * 0.35)
            );
            gradient.addColorStop(0, 'rgba(15, 23, 42, 0.44)');
            gradient.addColorStop(0.55, 'rgba(15, 23, 42, 0)');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0.36)');
            ctx.fillStyle = gradient;
            ctx.fillRect(-width / 2, -height / 2, width, height);
            ctx.restore();

            // Occlusion pass: darken where body edges/folds are present.
            ctx.save();
            ctx.globalCompositeOperation = 'multiply';
            ctx.globalAlpha = opacity * 0.22;
            ctx.filter = 'blur(0.7px)';
            ctx.drawImage(integration.map, -width / 2, -height / 2, width, height);
            ctx.restore();
        }

        ctx.restore();
    }

    drawWatermark(ctx, canvasWidth, canvasHeight) {
        if (!this.logoImage || !this.logoImage.complete || this.logoImage.naturalWidth === 0) return;

        const maxLogoWidth = Math.min(150, canvasWidth * 0.16);
        const minLogoWidth = 72;
        const logoWidth = Math.max(minLogoWidth, maxLogoWidth);
        const logoHeight = logoWidth * (this.logoImage.naturalHeight / this.logoImage.naturalWidth);

        const padding = Math.max(14, Math.round(canvasWidth * 0.018));
        const x = canvasWidth - logoWidth - padding;
        const y = canvasHeight - logoHeight - padding;

        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.drawImage(this.logoImage, x, y, logoWidth, logoHeight);
        ctx.restore();
    }

    drawLayer(ctx, image, transform, extra = null) {
        if (!image) return;

        const finalTransform = extra && extra.overrideTransform ? extra.overrideTransform : transform;
        const width = finalTransform.width * finalTransform.scale;
        const height = finalTransform.height * finalTransform.scale;

        ctx.save();
        ctx.translate(finalTransform.x, finalTransform.y);

        if (extra && typeof extra.rotation === 'number') {
            ctx.rotate(extra.rotation);
        }

        if (extra && typeof extra.opacity === 'number') {
            ctx.globalAlpha = extra.opacity;
        }

        ctx.drawImage(image, -width / 2, -height / 2, width, height);
        ctx.restore();
    }

    drawSelection(layerName) {
        const bounds = this.getLayerBounds(layerName);
        if (!bounds) return;

        this.ctx.save();
        this.ctx.setLineDash([7, 5]);
        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = layerName === 'tattoo' ? '#0f62a5' : '#1f8f5f';
        this.ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
        this.ctx.setLineDash([]);

        this.ctx.fillStyle = '#ffffff';
        this.ctx.strokeStyle = '#1f2937';
        for (const corner of bounds.corners) {
            this.ctx.beginPath();
            this.ctx.rect(corner.x - 5.5, corner.y - 5.5, 11, 11);
            this.ctx.fill();
            this.ctx.stroke();
        }

        this.ctx.restore();
    }

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (!this.bodyImage) return;

        this.drawLayer(this.ctx, this.bodyImage, this.body);

        if (this.tattooImage) {
            this.drawTattooLayer(this.ctx, this.tattooImage, this.tattoo, {
                rotation: this.tattoo.rotation,
                opacity: this.tattoo.opacity
            });
        }

        if (this.state.selectedLayer) {
            this.drawSelection(this.state.selectedLayer);
        }
    }
}
