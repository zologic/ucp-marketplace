/**
 * Smart Filter Chips Component
 * Displays parsed query filters (price, quality, availability, etc.)
 */

/**
 * Render filter chips from backend-generated labels
 * @param {Array} filterLabels - Array of {type, label, removable} from backend
 * @param {Function} onRemove - Callback when filter is removed: (filterType) => void
 * @returns {HTMLElement}
 */
export function renderFilterChips(filterLabels, onRemove) {
    const container = document.createElement('div');
    container.className = 'filter-chips-container';

    if (!filterLabels || filterLabels.length === 0) {
        return container; // Empty container if no filters
    }

    filterLabels.forEach(filter => {
        const chip = document.createElement('button');
        chip.className = 'filter-chip';
        chip.setAttribute('data-filter-type', filter.type);

        const label = document.createElement('span');
        label.className = 'filter-chip-label';
        label.textContent = filter.label;
        chip.appendChild(label);

        if (filter.removable !== false) {
            const removeBtn = document.createElement('span');
            removeBtn.className = 'filter-chip-remove';
            removeBtn.innerHTML = '&times;';
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                if (onRemove) {
                    onRemove(filter.type);
                }
            };
            chip.appendChild(removeBtn);
        }

        container.appendChild(chip);
    });

    return container;
}

/**
 * Create "Filters" button that opens bottom sheet
 * @param {Function} onClick - Callback when button is clicked
 * @returns {HTMLElement}
 */
export function createFiltersButton(onClick) {
    const button = document.createElement('button');
    button.className = 'filters-button';
    button.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M3 3a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-.293.707L12 10.414V17a1 1 0 01-.293.707l-2 2A1 1 0 018 19v-8.586L3.293 5.707A1 1 0 013 5V3z"/>
        </svg>
        <span>Filters</span>
    `;
    button.onclick = onClick;
    return button;
}

/**
 * Clear all filters and return to original query
 * @param {Function} onClear - Callback when cleared
 */
export function clearAllFilters(onClear) {
    if (onClear) {
        onClear();
    }
}

/**
 * Update filter chips display (called after search response)
 * @param {HTMLElement} container - Container to update
 * @param {Array} filterLabels - New filter labels from backend
 * @param {Function} onRemove - Remove callback
 */
export function updateFilterChips(container, filterLabels, onRemove) {
    if (!container) return;

    // Clear existing chips
    container.innerHTML = '';

    // Render new chips
    const newChips = renderFilterChips(filterLabels, onRemove);
    container.appendChild(newChips);
}
