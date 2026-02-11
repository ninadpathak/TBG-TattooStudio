// Canvas Controller - Direct Manipulation
// Click tattoo to select, drag to move, corner handles to resize
// Drag background to pan the view

export class CanvasController {
    constructor(canvasElement, containerElement) {
        this.canvas = canvasElement;
        this.container = containerElement;
        this.ctx = canvasElement.getContext('2d');

        // Images
        this.bodyImage = null;
        this.tattooImage = null;

        // Tattoo transform state (World Coordinates)
        this.tattoo = {
            x: 0,
            y: 0,
            scale: 1,
            rotation: 0,
            opacity: 1,
            originalWidth: 0,
            originalHeight: 0
        };

        // View Transform (Pan/Zoom)
        // Allows moving the workspace 'camera'
        this.view = {
            x: 0,
            y: 0,
            scale: 1
        };

        // Interaction state
        this.isSelected = false;
        this.isDragging = false; // Dragging tattoo
        this.isResizing = false; // Resizing tattoo
        this.isPanning = false;  // Panning view (background)
        this.activeHandle = null;

        // Track start positions for interactions
        this.dragStart = { x: 0, y: 0 }; // World coordinates for tattoo drag
        this.panStart = { x: 0, y: 0 };  // Screen/Raw coordinates for panning
        this.viewStart = { x: 0, y: 0 };
        this.tattooStart = { x: 0, y: 0, scale: 1 };

        // Display scale (internal pixels per screen pixel)
        this.displayScale = 1;

        // Handle size (dynamic, calculated per render)
        this.handleSizeBase = 12;

        // Callbacks
        this.onTattooPlaced = null;
        this.onSelectionChange = null;
        this.onTattooRemoved = null;

        this.setupEventListeners();
        this.setupKeyboardHandler();
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

        // Click outside canvas to deselect (handled via window/document if needed)
        // But we handle background click=deselect internally now to support panning

        this.canvas.style.cursor = 'grab'; // Default cursor indicates movable background
    }

    setupKeyboardHandler() {
        document.addEventListener('keydown', (e) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && this.isSelected && this.tattooImage) {
                e.preventDefault();
                this.removeTattoo();
            }
        });
    }

    removeTattoo() {
        this.tattooImage = null;
        this.setSelected(false);
        this.render();

        if (this.onTattooRemoved) {
            this.onTattooRemoved();
        }
    }

    /**
     * Get Event Position in "World" coordinates (accounting for View Pan/Zoom)
     * Used for interacting with the Tattoo
     */
    getWorldPosition(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        this.displayScale = scaleX;

        let clientX = e.clientX;
        let clientY = e.clientY;

        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        }

        // 1. Raw Canvas Coordinates (0,0 is top-left of canvas element)
        const rawX = (clientX - rect.left) * scaleX;
        const rawY = (clientY - rect.top) * scaleY;

        // 2. Apply View Transform (Inverse)
        // World = (Raw - Translate) / Scale
        const worldX = (rawX - this.view.x) / this.view.scale;
        const worldY = (rawY - this.view.y) / this.view.scale;

        return { x: worldX, y: worldY };
    }

    /**
     * Get Raw Event Position (Screen-relative but scaled to canvas)
     * Used for Panning calculations
     */
    getRawPosition(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        let clientX = e.clientX;
        let clientY = e.clientY;

        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        }

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
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

    getHandleSize() {
        if (!this.tattooImage) return this.handleSizeBase;
        // Adjust handle size based on display scale AND view scale
        // We want constant screen visual size
        return Math.max(10, 16 * this.displayScale / this.view.scale);
    }

    getHandleAtPoint(x, y) {
        if (!this.isSelected || !this.tattooImage) return null;

        const bounds = this.getTattooBounds();
        const hs = this.getHandleSize() * 1.5;

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
        if (!this.bodyImage) return;
        // Don't stop propagation immediately, allows internal tracking

        const worldPos = this.getWorldPosition(e);
        const rawPos = this.getRawPosition(e);

        if (this.tattooImage) {
            // 1. Check Resize Handles
            const handle = this.getHandleAtPoint(worldPos.x, worldPos.y);
            if (handle) {
                this.isResizing = true;
                this.activeHandle = handle;
                this.dragStart = worldPos;
                this.tattooStart = { ...this.tattoo };
                this.canvas.style.cursor = 'nwse-resize';
                e.preventDefault();
                return;
            }

            // 2. Check Tattoo Drag
            if (this.isOverTattoo(worldPos.x, worldPos.y)) {
                this.setSelected(true);
                this.isDragging = true;
                this.dragStart = worldPos;
                this.tattooStart = { ...this.tattoo };
                this.canvas.style.cursor = 'grabbing';
                this.render();
                e.preventDefault();
                return;
            }
        }

        // 3. Fallback: Pan View (Background Move)
        this.setSelected(false);
        this.isPanning = true;
        this.panStart = rawPos;
        this.viewStart = { ...this.view };
        this.canvas.style.cursor = 'grabbing';
        this.render();
    }

    handleMouseMove(e) {
        if (this.isResizing && this.activeHandle) {
            e.preventDefault();
            const worldPos = this.getWorldPosition(e);

            // Resizing logic (same as before but using world coordinates)
            const dx = worldPos.x - this.tattoo.x;
            const dy = worldPos.y - this.tattoo.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            const origW = this.tattoo.originalWidth * this.tattooStart.scale;
            const origH = this.tattoo.originalHeight * this.tattooStart.scale;
            const startDx = this.dragStart.x - this.tattooStart.x;
            const startDy = this.dragStart.y - this.tattooStart.y;
            const startDistance = Math.sqrt(startDx * startDx + startDy * startDy);

            if (startDistance > 0) {
                const scaleRatio = distance / startDistance;
                this.tattoo.scale = Math.max(0.1, Math.min(5, this.tattooStart.scale * scaleRatio));
            }
            this.render();

        } else if (this.isDragging) {
            e.preventDefault();
            const worldPos = this.getWorldPosition(e);

            this.tattoo.x = this.tattooStart.x + (worldPos.x - this.dragStart.x);
            this.tattoo.y = this.tattooStart.y + (worldPos.y - this.dragStart.y);
            this.render();

        } else if (this.isPanning) {
            e.preventDefault();
            const rawPos = this.getRawPosition(e);

            // Allow panning the view
            this.view.x = this.viewStart.x + (rawPos.x - this.panStart.x);
            this.view.y = this.viewStart.y + (rawPos.y - this.panStart.y);
            this.render();

        } else {
            // Hover states
            const worldPos = this.getWorldPosition(e);
            if (this.tattooImage) {
                const handle = this.getHandleAtPoint(worldPos.x, worldPos.y);
                if (handle) {
                    this.canvas.style.cursor = 'nwse-resize';
                } else if (this.isOverTattoo(worldPos.x, worldPos.y)) {
                    this.canvas.style.cursor = 'grab';
                } else {
                    this.canvas.style.cursor = 'grab'; // Default for background panning
                }
            } else {
                this.canvas.style.cursor = 'grab'; // Default for background panning
            }
        }
    }

    handleMouseUp() {
        this.isDragging = false;
        this.isResizing = false;
        this.isPanning = false;
        this.activeHandle = null;

        // Reset cursor based on hover
        this.canvas.style.cursor = 'grab';
    }

    handleTouchStart(e) {
        if (!this.bodyImage) return;
        e.preventDefault();
        this.handleMouseDown({
            touches: e.touches,
            stopPropagation: () => { },
            preventDefault: () => { }
        });
    }

    handleTouchMove(e) {
        if (!this.bodyImage) return;
        e.preventDefault();
        this.handleMouseMove({ touches: e.touches });
    }

    handleTouchEnd() {
        this.handleMouseUp();
    }

    setBodyImage(img) {
        this.bodyImage = img;

        // Reset view
        this.view = { x: 0, y: 0, scale: 1 };

        // Set canvas to actual image dimensions
        this.canvas.width = img.width;
        this.canvas.height = img.height;

        // Styles
        this.canvas.style.width = '100%';
        this.canvas.style.height = 'auto';
        this.canvas.style.maxWidth = '100%';
        this.canvas.style.maxHeight = 'none';
        this.canvas.style.objectFit = 'fill';
        this.canvas.style.touchAction = 'none';

        // Update display scale
        requestAnimationFrame(() => {
            const rect = this.canvas.getBoundingClientRect();
            if (rect.width > 0) {
                this.displayScale = this.canvas.width / rect.width;
                this.render();
            }
        });

        this.render();
    }

    setTattooImage(img) {
        this.tattooImage = img;
        this.tattoo.originalWidth = img.width;
        this.tattoo.originalHeight = img.height;

        // Position at center of CURRENT VIEW

        // Calculate World Center
        // WorldCenter = (CanvasWidth/2 - ViewX) / ViewScale -- No, simpler:
        // The canvas width IS the world width.
        // So center is just width/2.

        this.tattoo.x = this.canvas.width / 2;
        this.tattoo.y = this.canvas.height / 2;

        const maxDimension = Math.min(this.canvas.width, this.canvas.height) * 0.3;
        const imgMaxDimension = Math.max(img.width, img.height);
        this.tattoo.scale = maxDimension / imgMaxDimension;

        this.setSelected(true);
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

    clear() {
        this.bodyImage = null;
        this.tattooImage = null;
        this.setSelected(false);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    render() {
        // Clear entire canvas
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();

        // 1. Apply View Transform
        this.ctx.save();
        this.ctx.translate(this.view.x, this.view.y);
        this.ctx.scale(this.view.scale, this.view.scale);

        // 2. Draw body image at (0,0) world coords
        if (this.bodyImage) {
            this.ctx.drawImage(this.bodyImage, 0, 0, this.canvas.width, this.canvas.height);
        }

        // 3. Draw tattoo at (tattoo.x, tattoo.y) world coords
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

        this.ctx.restore(); // Restore view transform
    }

    exportImage() {
        // Export should produce the original composition without the view pan
        // (unless we want to support cropping, but usually users want full res)

        // 1. Save current view
        const currentView = { ...this.view };
        const wasSelected = this.isSelected;

        // 2. Reset view to identity to capture full image
        this.view = { x: 0, y: 0, scale: 1 };
        this.isSelected = false;

        this.render();

        const dataUrl = this.canvas.toDataURL('image/png');

        // 3. Restore view
        this.view = currentView;
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
