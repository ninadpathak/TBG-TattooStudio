// Canvas Controller - minimal interaction model
// - Upload body photo
// - Place one tattoo
// - Drag tattoo
// - Resize from corner handles
// - Rotate / opacity controlled externally by sliders

export class CanvasController {
    constructor(canvasElement, containerElement) {
        this.canvas = canvasElement;
        this.container = containerElement;
        this.ctx = canvasElement.getContext('2d');

        this.bodyImage = null;
        this.tattooImage = null;

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
            selected: false,
            dragging: false,
            resizing: false,
            activeHandle: null,
            dragStart: { x: 0, y: 0 },
            tattooStart: { x: 0, y: 0, scale: 1 }
        };

        this.onSelectionChange = null;
        this.onTattooRemoved = null;

        this.attachEvents();
    }

    attachEvents() {
        this.canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));
        window.addEventListener('pointermove', this.onPointerMove.bind(this));
        window.addEventListener('pointerup', this.onPointerUp.bind(this));

        this.canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

        document.addEventListener('keydown', (event) => {
            if (!this.tattooImage || !this.state.selected) return;

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

    setSelected(selected) {
        if (this.state.selected === selected) return;
        this.state.selected = selected;
        if (this.onSelectionChange) {
            this.onSelectionChange(selected);
        }
    }

    getTattooBounds() {
        if (!this.tattooImage) return null;

        const width = this.tattoo.width * this.tattoo.scale;
        const height = this.tattoo.height * this.tattoo.scale;
        const x = this.tattoo.x - (width / 2);
        const y = this.tattoo.y - (height / 2);

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

    isInsideTattoo(x, y) {
        const bounds = this.getTattooBounds();
        if (!bounds) return false;

        return (
            x >= bounds.x &&
            x <= bounds.x + bounds.width &&
            y >= bounds.y &&
            y <= bounds.y + bounds.height
        );
    }

    getHandleAt(x, y) {
        if (!this.state.selected) return null;

        const bounds = this.getTattooBounds();
        if (!bounds) return null;

        const size = Math.max(12, 14 * (this.canvas.width / this.canvas.getBoundingClientRect().width));

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

        if (this.tattooImage) {
            const handle = this.getHandleAt(point.x, point.y);
            if (handle) {
                this.state.resizing = true;
                this.state.activeHandle = handle;
                this.state.dragStart = point;
                this.state.tattooStart = {
                    x: this.tattoo.x,
                    y: this.tattoo.y,
                    scale: this.tattoo.scale
                };
                this.canvas.style.cursor = 'nwse-resize';
                this.canvas.setPointerCapture(event.pointerId);
                return;
            }

            if (this.isInsideTattoo(point.x, point.y)) {
                this.setSelected(true);
                this.state.dragging = true;
                this.state.dragStart = point;
                this.state.tattooStart = {
                    x: this.tattoo.x,
                    y: this.tattoo.y,
                    scale: this.tattoo.scale
                };
                this.canvas.style.cursor = 'grabbing';
                this.canvas.setPointerCapture(event.pointerId);
                return;
            }
        }

        this.setSelected(false);
        this.canvas.style.cursor = 'default';
        this.render();
    }

    onPointerMove(event) {
        if (!this.bodyImage) return;

        const point = this.toCanvasPoint(event);

        if (this.state.dragging) {
            this.tattoo.x = this.state.tattooStart.x + (point.x - this.state.dragStart.x);
            this.tattoo.y = this.state.tattooStart.y + (point.y - this.state.dragStart.y);
            this.render();
            return;
        }

        if (this.state.resizing) {
            const centerX = this.tattoo.x;
            const centerY = this.tattoo.y;

            const startDistance = Math.hypot(
                this.state.dragStart.x - centerX,
                this.state.dragStart.y - centerY
            );

            const currentDistance = Math.hypot(point.x - centerX, point.y - centerY);

            if (startDistance > 0) {
                const nextScale = this.state.tattooStart.scale * (currentDistance / startDistance);
                this.tattoo.scale = Math.min(5, Math.max(0.08, nextScale));
                this.render();
            }
            return;
        }

        if (!this.tattooImage) {
            this.canvas.style.cursor = 'default';
            return;
        }

        const handle = this.getHandleAt(point.x, point.y);
        if (handle) {
            this.canvas.style.cursor = 'nwse-resize';
        } else if (this.isInsideTattoo(point.x, point.y)) {
            this.canvas.style.cursor = 'grab';
        } else {
            this.canvas.style.cursor = 'default';
        }
    }

    onPointerUp() {
        this.state.dragging = false;
        this.state.resizing = false;
        this.state.activeHandle = null;

        if (!this.tattooImage) {
            this.canvas.style.cursor = 'default';
        } else if (this.state.selected) {
            this.canvas.style.cursor = 'grab';
        } else {
            this.canvas.style.cursor = 'default';
        }
    }

    setBodyImage(img) {
        this.bodyImage = img;
        this.tattooImage = null;
        this.setSelected(false);

        this.canvas.width = img.width;
        this.canvas.height = img.height;

        this.canvas.style.width = '100%';
        this.canvas.style.height = 'auto';
        this.canvas.style.maxWidth = '100%';
        this.canvas.style.maxHeight = '80vh';
        this.canvas.style.touchAction = 'none';

        this.render();
    }

    setTattooImage(img) {
        if (!this.bodyImage) return;

        this.tattooImage = img;

        const baseWidth = this.canvas.width * 0.34;
        this.tattoo.width = img.width;
        this.tattoo.height = img.height;
        this.tattoo.scale = baseWidth / img.width;
        this.tattoo.rotation = 0;
        this.tattoo.opacity = 1;
        this.tattoo.x = this.canvas.width / 2;
        this.tattoo.y = this.canvas.height / 2;

        this.setSelected(true);
        this.canvas.style.cursor = 'grab';
        this.render();
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
        this.setSelected(false);
        this.canvas.style.cursor = 'default';
        this.render();

        if (this.onTattooRemoved) {
            this.onTattooRemoved();
        }
    }

    clear() {
        this.bodyImage = null;
        this.tattooImage = null;
        this.setSelected(false);

        this.canvas.width = 1;
        this.canvas.height = 1;
        this.ctx.clearRect(0, 0, 1, 1);
        this.canvas.style.cursor = 'default';
    }

    hasContent() {
        return Boolean(this.bodyImage);
    }

    exportImage() {
        return this.canvas.toDataURL('image/png');
    }

    drawSelection() {
        const bounds = this.getTattooBounds();
        if (!bounds) return;

        this.ctx.save();
        this.ctx.strokeStyle = '#1f2937';
        this.ctx.setLineDash([8, 6]);
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);

        this.ctx.setLineDash([]);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.strokeStyle = '#111827';

        for (const corner of bounds.corners) {
            this.ctx.beginPath();
            this.ctx.rect(corner.x - 6, corner.y - 6, 12, 12);
            this.ctx.fill();
            this.ctx.stroke();
        }

        this.ctx.restore();
    }

    render() {
        const { width, height } = this.canvas;
        this.ctx.clearRect(0, 0, width, height);

        if (!this.bodyImage) return;

        this.ctx.drawImage(this.bodyImage, 0, 0, width, height);

        if (!this.tattooImage) return;

        const tattooWidth = this.tattoo.width * this.tattoo.scale;
        const tattooHeight = this.tattoo.height * this.tattoo.scale;

        this.ctx.save();
        this.ctx.translate(this.tattoo.x, this.tattoo.y);
        this.ctx.rotate(this.tattoo.rotation);
        this.ctx.globalAlpha = this.tattoo.opacity;

        this.ctx.drawImage(
            this.tattooImage,
            -tattooWidth / 2,
            -tattooHeight / 2,
            tattooWidth,
            tattooHeight
        );

        this.ctx.restore();

        if (this.state.selected) {
            this.drawSelection();
        }
    }
}
