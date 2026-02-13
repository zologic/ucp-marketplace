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

/**
 * Build category hierarchy (parent-child tree)
 * @param {Array} categories - Flat list of categories
 * @returns {Array} - Hierarchical tree structure
 */
export function buildCategoryTree(categories) {
    const categoryMap = {};
    const tree = [];

    // Create map for quick lookup
    categories.forEach(cat => {
        categoryMap[cat.id] = { ...cat, children: [] };
    });

    // Build tree structure
    categories.forEach(cat => {
        if (cat.parent_id && categoryMap[cat.parent_id]) {
            categoryMap[cat.parent_id].children.push(categoryMap[cat.id]);
        } else {
            tree.push(categoryMap[cat.id]);
        }
    });

    return tree;
}

/**
 * Get breadcrumb path for a category
 * @param {String} categorySlug - Category slug to find path for
 * @param {Array} categories - All categories
 * @returns {Array} - Array of {name, slug} breadcrumb items
 */
export function getCategoryBreadcrumbs(categorySlug, categories) {
    const category = categories.find(c => c.slug === categorySlug);
    if (!category) return [];

    const breadcrumbs = [];
    let current = category;

    // Walk up the parent chain
    while (current) {
        breadcrumbs.unshift({
            name: current.name,
            slug: current.slug,
            id: current.id
        });

        if (current.parent_id) {
            current = categories.find(c => c.id === current.parent_id);
        } else {
            current = null;
        }
    }

    return breadcrumbs;
}

/**
 * Render category breadcrumbs
 * @param {String} categorySlug - Selected category slug
 * @param {Array} categories - All categories
 * @param {Function} onBreadcrumbClick - Callback when breadcrumb is clicked
 * @returns {HTMLElement} - Breadcrumb container
 */
export function renderCategoryBreadcrumbs(categorySlug, categories, onBreadcrumbClick) {
    const container = document.createElement('div');
    container.className = 'category-breadcrumbs';

    if (!categorySlug) {
        container.style.display = 'none';
        return container;
    }

    const breadcrumbs = getCategoryBreadcrumbs(categorySlug, categories);

    if (breadcrumbs.length === 0) {
        container.style.display = 'none';
        return container;
    }

    // Add "All" link at the start
    const allLink = document.createElement('span');
    allLink.className = 'breadcrumb-item clickable';
    allLink.textContent = 'All';
    allLink.onclick = () => onBreadcrumbClick(null);
    container.appendChild(allLink);

    // Add separator
    const separator = document.createElement('span');
    separator.className = 'breadcrumb-separator';
    separator.textContent = '›';
    container.appendChild(separator);

    // Add breadcrumb items
    breadcrumbs.forEach((crumb, index) => {
        const isLast = index === breadcrumbs.length - 1;

        const item = document.createElement('span');
        item.className = isLast ? 'breadcrumb-item active' : 'breadcrumb-item clickable';
        item.textContent = crumb.name;

        if (!isLast) {
            item.onclick = () => onBreadcrumbClick(crumb.slug);
        }

        container.appendChild(item);

        // Add separator if not last
        if (!isLast) {
            const sep = document.createElement('span');
            sep.className = 'breadcrumb-separator';
            sep.textContent = '›';
            container.appendChild(sep);
        }
    });

    return container;
}

/**
 * Render hierarchical category list in bottom sheet
 * @param {Array} categories - All categories
 * @param {Function} onCategorySelect - Callback when category is selected
 */
export function renderHierarchicalCategoryList(categories, onCategorySelect) {
    const listContainer = document.getElementById('category-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    const tree = buildCategoryTree(categories);

    function renderNode(node, level = 0) {
        const item = document.createElement('div');
        item.className = 'category-item';
        item.style.paddingLeft = `${16 + level * 20}px`;

        if (selectedCategorySlug === node.slug) {
            item.classList.add('selected');
        }

        const content = document.createElement('div');
        content.className = 'category-item-content';

        // Add expand icon if has children
        if (node.children && node.children.length > 0) {
            const expandIcon = document.createElement('span');
            expandIcon.className = 'category-expand-icon';
            expandIcon.textContent = '›';
            content.appendChild(expandIcon);
        }

        const name = document.createElement('span');
        name.className = 'category-name';
        name.textContent = node.name;
        content.appendChild(name);

        const count = document.createElement('span');
        count.className = 'category-item-count';
        count.textContent = node.product_count || 0;
        content.appendChild(count);

        item.appendChild(content);

        item.addEventListener('click', (e) => {
            e.stopPropagation();
            if (selectedCategorySlug === node.slug) {
                selectedCategorySlug = null;
            } else {
                selectedCategorySlug = node.slug;
            }
            onCategorySelect(selectedCategorySlug);
            closeBottomSheet();
            updateChipsActiveState();
        });

        listContainer.appendChild(item);

        // Render children
        if (node.children && node.children.length > 0) {
            node.children.forEach(child => renderNode(child, level + 1));
        }
    }

    tree.forEach(node => renderNode(node, 0));
}
