/**
 * Category Management Module
 * Handles category fetching, rendering, and filtering
 */

let currentCategories = [];
let selectedCategorySlug = null;

/**
 * Fetch categories from API
 */
export async function fetchCategories(apiBase) {
    try {
        const response = await fetch(`${apiBase}/categories`);
        if (!response.ok) {
            throw new Error('Failed to fetch categories');
        }
        const data = await response.json();
        currentCategories = data.categories || [];
        return currentCategories;
    } catch (error) {
        console.error('[fetchCategories] Error:', error);
        return [];
    }
}

/**
 * Render category chips (top 3 + More button)
 */
export function renderCategoryChips(categories, onCategorySelect, onMoreClick) {
    const chipsContainer = document.getElementById('category-chips');
    if (!chipsContainer) return;

    chipsContainer.innerHTML = '';

    if (categories.length === 0) return;

    // Show top 3 categories
    const topCategories = categories.slice(0, 3);

    topCategories.forEach(category => {
        const chip = document.createElement('div');
        chip.className = 'category-chip';
        if (selectedCategorySlug === category.slug) {
            chip.classList.add('active');
        }

        chip.innerHTML = `
            <span>${category.name}</span>
            <span class="category-count">(${category.product_count})</span>
        `;

        chip.addEventListener('click', () => {
            if (selectedCategorySlug === category.slug) {
                // Deselect if clicking same category
                selectedCategorySlug = null;
            } else {
                selectedCategorySlug = category.slug;
            }
            onCategorySelect(selectedCategorySlug);
            updateChipsActiveState();
        });

        chipsContainer.appendChild(chip);
    });

    // Add "More" button if there are more than 3 categories
    if (categories.length > 3) {
        const moreButton = document.createElement('div');
        moreButton.className = 'category-chip more-button';
        moreButton.innerHTML = '<span>More +</span>';
        moreButton.addEventListener('click', onMoreClick);
        chipsContainer.appendChild(moreButton);
    }
}

/**
 * Update active state of chips
 */
function updateChipsActiveState() {
    const chips = document.querySelectorAll('.category-chip:not(.more-button)');
    chips.forEach((chip, index) => {
        if (currentCategories[index] && currentCategories[index].slug === selectedCategorySlug) {
            chip.classList.add('active');
        } else {
            chip.classList.remove('active');
        }
    });
}

/**
 * Render full category list in bottom sheet
 */
export function renderCategoryList(categories, onCategorySelect) {
    const listContainer = document.getElementById('category-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    categories.forEach(category => {
        const item = document.createElement('div');
        item.className = 'category-item';
        if (selectedCategorySlug === category.slug) {
            item.classList.add('selected');
        }

        item.innerHTML = `
            <span class="category-name">${category.name}</span>
            <span class="category-item-count">${category.product_count}</span>
        `;

        item.addEventListener('click', () => {
            if (selectedCategorySlug === category.slug) {
                // Deselect if clicking same category
                selectedCategorySlug = null;
            } else {
                selectedCategorySlug = category.slug;
            }
            onCategorySelect(selectedCategorySlug);
            closeBottomSheet();
            updateChipsActiveState();
        });

        listContainer.appendChild(item);
    });
}

/**
 * Show bottom sheet
 */
export function showBottomSheet() {
    const sheet = document.getElementById('category-bottom-sheet');
    const backdrop = document.getElementById('bottom-sheet-backdrop');

    if (sheet && backdrop) {
        sheet.classList.remove('hidden');
        backdrop.classList.remove('hidden');

        // Trigger animation after a brief delay
        setTimeout(() => {
            sheet.classList.add('visible');
            backdrop.classList.add('visible');
        }, 10);
    }
}

/**
 * Close bottom sheet
 */
export function closeBottomSheet() {
    const sheet = document.getElementById('category-bottom-sheet');
    const backdrop = document.getElementById('bottom-sheet-backdrop');

    if (sheet && backdrop) {
        sheet.classList.remove('visible');
        backdrop.classList.remove('visible');

        // Wait for animation before hiding
        setTimeout(() => {
            sheet.classList.add('hidden');
            backdrop.classList.add('hidden');
        }, 300);
    }
}

/**
 * Show category section
 */
export function showCategorySection() {
    const section = document.getElementById('category-section');
    if (section) {
        section.classList.remove('hidden');
    }
}

/**
 * Hide category section
 */
export function hideCategorySection() {
    const section = document.getElementById('category-section');
    if (section) {
        section.classList.add('hidden');
    }
    selectedCategorySlug = null;
}

/**
 * Get currently selected category slug
 */
export function getSelectedCategorySlug() {
    return selectedCategorySlug;
}

/**
 * Set selected category slug (for external updates)
 */
export function setSelectedCategorySlug(slug) {
    selectedCategorySlug = slug;
    updateChipsActiveState();
}

/**
 * Get all categories
 */
export function getCategories() {
    return currentCategories;
}
