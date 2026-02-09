// Credits Manager
// Handles localStorage-based credit system for AI generation

const CREDITS_KEY = 'tattoo_tryon_credits';
const DEFAULT_CREDITS = 3;

class CreditsManager {
    constructor() {
        this.credits = this.loadCredits();
        this.updateDisplay();
    }

    loadCredits() {
        const stored = localStorage.getItem(CREDITS_KEY);
        if (stored === null) {
            // First time user - grant 3 free credits
            localStorage.setItem(CREDITS_KEY, DEFAULT_CREDITS);
            return DEFAULT_CREDITS;
        }
        return parseInt(stored, 10);
    }

    saveCredits() {
        localStorage.setItem(CREDITS_KEY, this.credits.toString());
        this.updateDisplay();
    }

    getCredits() {
        return this.credits;
    }

    hasCredits(amount = 1) {
        return this.credits >= amount;
    }

    useCredit(amount = 1) {
        if (!this.hasCredits(amount)) {
            return false;
        }
        this.credits -= amount;
        this.saveCredits();
        return true;
    }

    addCredits(amount) {
        this.credits += amount;
        this.saveCredits();
    }

    updateDisplay() {
        const countEl = document.getElementById('creditsCount');
        if (countEl) {
            countEl.textContent = this.credits;
            
            // Add pulse animation on change
            countEl.classList.add('pulse');
            setTimeout(() => countEl.classList.remove('pulse'), 300);
        }
    }

    showBuyModal() {
        const modal = document.getElementById('creditsModal');
        if (modal) {
            modal.classList.add('visible');
        }
    }

    hideBuyModal() {
        const modal = document.getElementById('creditsModal');
        if (modal) {
            modal.classList.remove('visible');
        }
    }
}

export const creditsManager = new CreditsManager();
