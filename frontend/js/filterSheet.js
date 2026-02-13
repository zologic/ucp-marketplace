/**
 * Filter Bottom Sheet with Price Slider
 * Advanced filtering UI for price ranges, stock status, etc.
 */

let activeSheet = null;

/**
 * Create and show filter bottom sheet
 * @param {Object} currentFilters - Current applied filters {price_min_cents, price_max_cents, in_stock_only, currency}
 * @param {Function} onApply - Callback with new filters: (filters) => void
 * @param {Function} onClose - Callback when closed without applying
 */
export function showFilterSheet(currentFilters = {}, onApply, onClose) {
    // Close existing sheet if any
    if (activeSheet) {
        closeFilterSheet();
    }

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'filter-sheet-overlay';
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            closeFilterSheet();
            if (onClose) onClose();
        }
    };

    // Create sheet
    const sheet = document.createElement('div');
    sheet.className = 'filter-sheet';

    // Header
    const header = document.createElement('div');
    header.className = 'filter-sheet-header';
    header.innerHTML = `
        <h3>Filters</h3>
        <button class="filter-sheet-close" aria-label="Close">&times;</button>
    `;
    sheet.appendChild(header);

    // Content
    const content = document.createElement('div');
    content.className = 'filter-sheet-content';

    // Price Range Section
    const priceSection = createPriceRangeSection(currentFilters);
    content.appendChild(priceSection);

    // Stock Status Section
    const stockSection = createStockSection(currentFilters);
    content.appendChild(stockSection);

    sheet.appendChild(content);

    // Footer with actions
    const footer = document.createElement('div');
    footer.className = 'filter-sheet-footer';
    footer.innerHTML = `
        <button class="btn btn-secondary filter-clear">Clear All</button>
        <button class="btn btn-primary filter-apply">Apply Filters</button>
    `;
    sheet.appendChild(footer);

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    // Animate in
    requestAnimationFrame(() => {
        overlay.classList.add('active');
    });

    activeSheet = overlay;

    // Event listeners
    const closeBtn = header.querySelector('.filter-sheet-close');
    closeBtn.onclick = () => {
        closeFilterSheet();
        if (onClose) onClose();
    };

    const clearBtn = footer.querySelector('.filter-clear');
    clearBtn.onclick = () => {
        // Reset all inputs
        const minInput = content.querySelector('#price-min');
        const maxInput = content.querySelector('#price-max');
        const stockCheckbox = content.querySelector('#in-stock-only');

        if (minInput) minInput.value = '';
        if (maxInput) maxInput.value = '';
        if (stockCheckbox) stockCheckbox.checked = false;

        updatePriceSliderDisplay(content, '', '');
    };

    const applyBtn = footer.querySelector('.filter-apply');
    applyBtn.onclick = () => {
        const filters = collectFilters(content, currentFilters);
        closeFilterSheet();
        if (onApply) {
            onApply(filters);
        }
    };

    return overlay;
}

/**
 * Close active filter sheet
 */
export function closeFilterSheet() {
    if (activeSheet) {
        activeSheet.classList.remove('active');
        setTimeout(() => {
            if (activeSheet && activeSheet.parentNode) {
                activeSheet.parentNode.removeChild(activeSheet);
            }
            activeSheet = null;
        }, 300);
    }
}

/**
 * Create price range section with slider
 */
function createPriceRangeSection(currentFilters) {
    const section = document.createElement('div');
    section.className = 'filter-section';

    const currency = currentFilters.currency || 'EUR';
    const symbol = getCurrencySymbol(currency);

    const minCents = currentFilters.price_min_cents || currentFilters.min_price_cents || 0;
    const maxCents = currentFilters.price_max_cents || currentFilters.max_price_cents || 100000; // Default max €1000

    const minValue = (minCents / 100).toFixed(0);
    const maxValue = (maxCents / 100).toFixed(0);

    section.innerHTML = `
        <h4 class="filter-section-title">Price Range</h4>
        <div class="price-range-display">
            <span class="price-range-label">
                <span id="price-display-min">${minValue > 0 ? symbol + minValue : 'Min'}</span>
                -
                <span id="price-display-max">${maxValue < 1000 ? symbol + maxValue : 'Max'}</span>
            </span>
        </div>
        <div class="price-inputs">
            <div class="price-input-group">
                <label for="price-min">Min (${symbol})</label>
                <input
                    type="number"
                    id="price-min"
                    placeholder="0"
                    min="0"
                    step="10"
                    value="${minValue > 0 ? minValue : ''}"
                />
            </div>
            <div class="price-input-separator">-</div>
            <div class="price-input-group">
                <label for="price-max">Max (${symbol})</label>
                <input
                    type="number"
                    id="price-max"
                    placeholder="1000"
                    min="0"
                    step="10"
                    value="${maxValue < 1000 ? maxValue : ''}"
                />
            </div>
        </div>
    `;

    // Add input listeners to update display
    const minInput = section.querySelector('#price-min');
    const maxInput = section.querySelector('#price-max');

    minInput.oninput = () => updatePriceSliderDisplay(section, minInput.value, maxInput.value, symbol);
    maxInput.oninput = () => updatePriceSliderDisplay(section, minInput.value, maxInput.value, symbol);

    return section;
}

/**
 * Create stock status section
 */
function createStockSection(currentFilters) {
    const section = document.createElement('div');
    section.className = 'filter-section';

    const isChecked = currentFilters.in_stock_only === true;

    section.innerHTML = `
        <h4 class="filter-section-title">Availability</h4>
        <label class="filter-checkbox">
            <input type="checkbox" id="in-stock-only" ${isChecked ? 'checked' : ''} />
            <span>In Stock Only</span>
        </label>
    `;

    return section;
}

/**
 * Update price display labels
 */
function updatePriceSliderDisplay(container, minVal, maxVal, symbol = '€') {
    const minDisplay = container.querySelector('#price-display-min');
    const maxDisplay = container.querySelector('#price-display-max');

    if (minDisplay) {
        minDisplay.textContent = minVal && minVal > 0 ? symbol + minVal : 'Min';
    }

    if (maxDisplay) {
        maxDisplay.textContent = maxVal && maxVal > 0 ? symbol + maxVal : 'Max';
    }
}

/**
 * Collect all filter values from the sheet
 */
function collectFilters(content, currentFilters) {
    const minInput = content.querySelector('#price-min');
    const maxInput = content.querySelector('#price-max');
    const stockCheckbox = content.querySelector('#in-stock-only');

    const filters = {
        currency: currentFilters.currency || 'EUR'
    };

    if (minInput && minInput.value) {
        filters.price_min_cents = parseInt(minInput.value) * 100;
    }

    if (maxInput && maxInput.value) {
        filters.price_max_cents = parseInt(maxInput.value) * 100;
    }

    if (stockCheckbox && stockCheckbox.checked) {
        filters.in_stock_only = true;
    }

    return filters;
}

/**
 * Get currency symbol
 */
function getCurrencySymbol(currency) {
    const symbols = {
        EUR: '€',
        USD: '$',
        GBP: '£'
    };
    return symbols[currency] || currency;
}
