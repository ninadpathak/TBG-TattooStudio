// Credits Manager
// Handles localStorage-based credit system for AI generation
//
// NOTE: Credits UI (modal/counter) has been removed/disabled.
// We keep this module to avoid breaking imports, but credits are treated as unlimited.

const CREDITS_KEY = 'tattoo_tryon_credits';
const DEFAULT_CREDITS = 3;

// Toggle if you ever want to re-enable credits later.
const CREDITS_ENABLED = false;

class CreditsManager {
    constructor() {
        this.credits = this.loadCredits();
        this.updateDisplay();
    }

    loadCredits() {
        if (!CREDITS_ENABLED) {
            return Number.POSITIVE_INFINITY;
        }

        const stored = localStorage.getItem(CREDITS_KEY);
        if (stored === null) {
            // First time user - grant 3 free credits
            localStorage.setItem(CREDITS_KEY, DEFAULT_CREDITS);
            return DEFAULT_CREDITS;
        }
        return parseInt(stored, 10);
    }

    saveCredits() {
        if (!CREDITS_ENABLED) {
            return;
        }
        localStorage.setItem(CREDITS_KEY, this.credits.toString());
        this.updateDisplay();
    }

    getCredits() {
        return this.credits;
    }

    hasCredits(amount = 1) {
        if (!CREDITS_ENABLED) {
            return true;
        }
        return this.credits >= amount;
    }

    useCredit(amount = 1) {
        if (!CREDITS_ENABLED) {
            return true;
        }
        if (!this.hasCredits(amount)) {
            return false;
        }
        this.credits -= amount;
        this.saveCredits();
        return true;
    }

    addCredits(amount) {
        if (!CREDITS_ENABLED) {
            return;
        }
        this.credits += amount;
        this.saveCredits();
    }

    updateDisplay() {
        // Credits counter UI removed/disabled.
        if (!CREDITS_ENABLED) {
            return;
        }

        const countEl = document.getElementById('creditsCount');
        if (countEl) {
            countEl.textContent = this.credits;

            // Add pulse animation on change
            countEl.classList.add('pulse');
            setTimeout(() => countEl.classList.remove('pulse'), 300);
        }
    }

    showBuyModal() {
        // Credits purchase modal removed/disabled.
        if (!CREDITS_ENABLED) {
            return;
        }

        const modal = document.getElementById('creditsModal');
        if (modal) {
            modal.classList.add('visible');
        }
    }

    hideBuyModal() {
        if (!CREDITS_ENABLED) {
            return;
        }

        const modal = document.getElementById('creditsModal');
        if (modal) {
            modal.classList.remove('visible');
        }
    }
}

export const creditsManager = new CreditsManager();
