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
        exportCanvas.width = this.canvas.width;
        exportCanvas.height = this.canvas.height;
        const exportCtx = exportCanvas.getContext('2d');

        this.drawLayer(exportCtx, this.bodyImage, this.body);

        if (this.tattooImage) {
            this.drawLayer(exportCtx, this.tattooImage, this.tattoo, {
                rotation: this.tattoo.rotation,
                opacity: this.tattoo.opacity
            });
        }

        return exportCanvas.toDataURL('image/png');
    }

    drawLayer(ctx, image, transform, extra = null) {
        if (!image) return;

        const width = transform.width * transform.scale;
        const height = transform.height * transform.scale;

        ctx.save();
        ctx.translate(transform.x, transform.y);

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
            this.drawLayer(this.ctx, this.tattooImage, this.tattoo, {
                rotation: this.tattoo.rotation,
                opacity: this.tattoo.opacity
            });
        }

        if (this.state.selectedLayer) {
            this.drawSelection(this.state.selectedLayer);
        }
    }
}
