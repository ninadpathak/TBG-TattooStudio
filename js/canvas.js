// Canvas Controller - Direct Manipulation
// Click tattoo to select, drag to move, corner handles to resize

export class CanvasController {
    constructor(canvasElement, containerElement) {
        this.canvas = canvasElement;
        this.container = containerElement;
        this.ctx = canvasElement.getContext('2d');

        // Images
        this.bodyImage = null;
        this.tattooImage = null;

        // Tattoo transform state
        this.tattoo = {
            x: 0,
            y: 0,
            scale: 1,
            rotation: 0,
            opacity: 1,
            originalWidth: 0,
            originalHeight: 0
        };

        // Interaction state
        this.isSelected = false;
        this.isDragging = false;
        this.isResizing = false;
        this.activeHandle = null;
        this.dragStart = { x: 0, y: 0 };
        this.tattooStart = { x: 0, y: 0, scale: 1 };

        // Handle size (dynamic, calculated per render)
        this.handleSizeBase = 12;
        this.handleSizeMin = 4;

        // Callbacks
        this.onTattooPlaced = null;
        this.onSelectionChange = null;

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Mouse events
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this.handleMouseUp.bind(this));

        // Touch events
        this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));

        // Click outside canvas to deselect (use mousedown to avoid race with canvas click)
        document.addEventListener('mousedown', (e) => {
            if (!this.canvas.contains(e.target) && this.isSelected) {
                this.setSelected(false);
                this.render();
            }
        });

        this.canvas.style.cursor = 'default';
    }

    getEventPosition(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        if (e.touches) {
            return {
                x: (e.touches[0].clientX - rect.left) * scaleX,
                y: (e.touches[0].clientY - rect.top) * scaleY
            };
        }
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    // Get tattoo bounding box corners
    getTattooBounds() {
        if (!this.tattooImage) return null;

        const w = this.tattoo.originalWidth * this.tattoo.scale;
        const h = this.tattoo.originalHeight * this.tattoo.scale;
        const halfW = w / 2;
        const halfH = h / 2;

        return {
            x: this.tattoo.x - halfW,
            y: this.tattoo.y - halfH,
            width: w,
            height: h,
            corners: [
                { x: this.tattoo.x - halfW, y: this.tattoo.y - halfH, type: 'nw' },
                { x: this.tattoo.x + halfW, y: this.tattoo.y - halfH, type: 'ne' },
                { x: this.tattoo.x + halfW, y: this.tattoo.y + halfH, type: 'se' },
                { x: this.tattoo.x - halfW, y: this.tattoo.y + halfH, type: 'sw' }
            ]
        };
    }

    // Compute handle size proportional to tattoo
    getHandleSize() {
        if (!this.tattooImage) return this.handleSizeBase;
        const w = this.tattoo.originalWidth * this.tattoo.scale;
        const h = this.tattoo.originalHeight * this.tattoo.scale;
        const minDim = Math.min(w, h);
        // Handle = 8% of smallest dimension, clamped
        return Math.max(this.handleSizeMin, Math.min(this.handleSizeBase, minDim * 0.08));
    }

    // Check if point is over a resize handle
    getHandleAtPoint(x, y) {
        if (!this.isSelected || !this.tattooImage) return null;

        const bounds = this.getTattooBounds();
        const hs = this.getHandleSize() * 1.5; // slightly larger hit area

        for (const corner of bounds.corners) {
            if (x >= corner.x - hs && x <= corner.x + hs &&
                y >= corner.y - hs && y <= corner.y + hs) {
                return corner.type;
            }
        }
        return null;
    }

    isOverTattoo(x, y) {
        if (!this.tattooImage) return false;
        const bounds = this.getTattooBounds();
        return x >= bounds.x && x <= bounds.x + bounds.width &&
            y >= bounds.y && y <= bounds.y + bounds.height;
    }

    setSelected(selected) {
        if (this.isSelected !== selected) {
            this.isSelected = selected;
            if (this.onSelectionChange) {
                this.onSelectionChange(selected);
            }
        }
    }

    handleMouseDown(e) {
        if (!this.tattooImage) return;
        e.stopPropagation();

        const pos = this.getEventPosition(e);

        // Check for handle first
        const handle = this.getHandleAtPoint(pos.x, pos.y);
        if (handle) {
            this.isResizing = true;
            this.activeHandle = handle;
            this.dragStart = pos;
            this.tattooStart = {
                x: this.tattoo.x,
                y: this.tattoo.y,
                scale: this.tattoo.scale
            };
            this.canvas.style.cursor = 'nwse-resize';
            return;
        }

        // Check if clicking on tattoo
        if (this.isOverTattoo(pos.x, pos.y)) {
            this.setSelected(true);
            this.isDragging = true;
            this.dragStart = pos;
            this.tattooStart = {
                x: this.tattoo.x,
                y: this.tattoo.y,
                scale: this.tattoo.scale
            };
            this.canvas.style.cursor = 'grabbing';
            this.render();
        } else {
            // Clicked outside tattoo - deselect
            this.setSelected(false);
            this.render();
        }
    }

    handleMouseMove(e) {
        const pos = this.getEventPosition(e);

        if (this.isResizing && this.activeHandle) {
            // Calculate distance from center
            const dx = pos.x - this.tattoo.x;
            const dy = pos.y - this.tattoo.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Original distance from center
            const origW = this.tattoo.originalWidth * this.tattooStart.scale;
            const origH = this.tattoo.originalHeight * this.tattooStart.scale;
            const origDistance = Math.sqrt((origW / 2) ** 2 + (origH / 2) ** 2);

            // Calculate scale based on drag start vs current
            const startDx = this.dragStart.x - this.tattooStart.x;
            const startDy = this.dragStart.y - this.tattooStart.y;
            const startDistance = Math.sqrt(startDx * startDx + startDy * startDy);

            if (startDistance > 0) {
                const scaleRatio = distance / startDistance;
                this.tattoo.scale = Math.max(0.1, Math.min(5, this.tattooStart.scale * scaleRatio));
            }

            this.render();
        } else if (this.isDragging) {
            const dx = pos.x - this.dragStart.x;
            const dy = pos.y - this.dragStart.y;
            this.tattoo.x = this.tattooStart.x + dx;
            this.tattoo.y = this.tattooStart.y + dy;
            this.render();
        } else if (this.tattooImage) {
            // Update cursor based on what's under mouse
            const handle = this.getHandleAtPoint(pos.x, pos.y);
            if (handle) {
                this.canvas.style.cursor = 'nwse-resize';
            } else if (this.isOverTattoo(pos.x, pos.y)) {
                this.canvas.style.cursor = 'grab';
            } else {
                this.canvas.style.cursor = 'default';
            }
        }
    }

    handleMouseUp() {
        this.isDragging = false;
        this.isResizing = false;
        this.activeHandle = null;
        this.canvas.style.cursor = 'default';
    }

    // Touch handlers
    handleTouchStart(e) {
        if (!this.tattooImage) return;
        e.preventDefault();
        // Simulate mouse event
        this.handleMouseDown({
            touches: e.touches,
            stopPropagation: () => { }
        });
    }

    handleTouchMove(e) {
        e.preventDefault();
        this.handleMouseMove({ touches: e.touches });
    }

    handleTouchEnd() {
        this.handleMouseUp();
    }

    setBodyImage(img) {
        this.bodyImage = img;

        // Set canvas to actual image dimensions
        this.canvas.width = img.width;
        this.canvas.height = img.height;

        // Let CSS handle the display sizing
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.objectFit = 'contain';

        this.render();
    }

    setTattooImage(img) {
        this.tattooImage = img;
        this.tattoo.originalWidth = img.width;
        this.tattoo.originalHeight = img.height;

        // Center the tattoo
        this.tattoo.x = this.canvas.width / 2;
        this.tattoo.y = this.canvas.height / 2;

        // Scale tattoo to reasonable size (30% of smallest dimension)
        const maxDimension = Math.min(this.canvas.width, this.canvas.height) * 0.3;
        const imgMaxDimension = Math.max(img.width, img.height);
        this.tattoo.scale = maxDimension / imgMaxDimension;

        this.setSelected(true); // Auto-select when placed
        this.render();

        if (this.onTattooPlaced) {
            this.onTattooPlaced();
        }
    }

    setScale(scale) {
        this.tattoo.scale = scale / 100;
        this.render();
    }

    setRotation(degrees) {
        this.tattoo.rotation = degrees * (Math.PI / 180);
        this.render();
    }

    setOpacity(opacity) {
        this.tattoo.opacity = opacity / 100;
        this.render();
    }

    resetTattooPosition() {
        if (!this.tattooImage) return;
        this.tattoo.x = this.canvas.width / 2;
        this.tattoo.y = this.canvas.height / 2;
        const maxDimension = Math.min(this.canvas.width, this.canvas.height) * 0.3;
        const imgMaxDimension = Math.max(this.tattooImage.width, this.tattooImage.height);
        this.tattoo.scale = maxDimension / imgMaxDimension;
        this.tattoo.rotation = 0;
        this.tattoo.opacity = 1;
        this.render();
    }

    clear() {
        this.bodyImage = null;
        this.tattooImage = null;
        this.setSelected(false);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw body image
        if (this.bodyImage) {
            this.ctx.drawImage(this.bodyImage, 0, 0, this.canvas.width, this.canvas.height);
        }

        // Draw tattoo
        if (this.tattooImage) {
            const w = this.tattoo.originalWidth * this.tattoo.scale;
            const h = this.tattoo.originalHeight * this.tattoo.scale;

            this.ctx.save();
            this.ctx.globalAlpha = this.tattoo.opacity;
            this.ctx.translate(this.tattoo.x, this.tattoo.y);
            this.ctx.rotate(this.tattoo.rotation);
            this.ctx.drawImage(this.tattooImage, -w / 2, -h / 2, w, h);
            this.ctx.restore();

            // Draw selection handles if selected
            if (this.isSelected) {
                this.drawSelectionHandles();
            }
        }
    }

    drawSelectionHandles() {
        const bounds = this.getTattooBounds();
        if (!bounds) return;

        const hs = this.getHandleSize();

        this.ctx.save();

        // Draw border
        this.ctx.strokeStyle = '#6750a4';
        this.ctx.lineWidth = Math.max(1, hs * 0.25);
        this.ctx.setLineDash([6, 4]);
        this.ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
        this.ctx.setLineDash([]);

        // Draw corner handles
        this.ctx.fillStyle = '#6750a4';

        for (const corner of bounds.corners) {
            this.ctx.beginPath();
            this.ctx.arc(corner.x, corner.y, hs, 0, Math.PI * 2);
            this.ctx.fill();

            // White inner circle
            this.ctx.fillStyle = '#ffffff';
            this.ctx.beginPath();
            this.ctx.arc(corner.x, corner.y, Math.max(1, hs - 2), 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.fillStyle = '#6750a4';
        }

        this.ctx.restore();
    }

    exportImage() {
        // Temporarily hide selection handles for export
        const wasSelected = this.isSelected;
        this.isSelected = false;
        this.render();
        const dataUrl = this.canvas.toDataURL('image/png');
        this.isSelected = wasSelected;
        this.render();
        return dataUrl;
    }

    hasContent() {
        return this.bodyImage !== null;
    }

    hasTattoo() {
        return this.tattooImage !== null;
    }
}
