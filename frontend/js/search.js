/**
 * Search Logic
 * Handles product search requests
 */

import { showLoading, hideLoading, renderResults, renderError, clearError } from './ui.js';
import { showCategorySection } from './categories.js';
import { showFilterSheet } from './filterSheet.js';

// Global filter state
let currentFilters = {};
let lastQuery = '';
let lastApiBase = '';

/**
 * Handle product search with optional category filter
 * @param {string} query - Search query
 * @param {string} apiBase - API base URL
 * @param {string|null} categorySlug - Optional category slug to filter by
 * @param {Object} filters - Additional filters (price, stock, etc.)
 */
export async function handleSearch(query, apiBase, categorySlug = null, filters = {}) {
    lastQuery = query;
    lastApiBase = apiBase;
    // Trigger pill transition to sticky bottom
    const searchPill = document.querySelector('.search-pill');
    const trustIndicators = document.querySelector('.trust-indicators');

    if (searchPill) {
        searchPill.classList.remove('centered');
        searchPill.classList.add('sticky');
    }

    // Hide trust indicators during results
    if (trustIndicators) {
        trustIndicators.classList.add('hidden-for-results');
    }

    // Smooth scroll to results area on subsequent searches
    const resultsSection = document.getElementById('results-section');
    if (resultsSection && !resultsSection.classList.contains('hidden')) {
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    showLoading();
    clearError();

    try {
        const requestBody = { query };

        // Merge filters
        const allFilters = { ...filters };
        if (categorySlug) {
            allFilters.category_slug = categorySlug;
        }

        if (Object.keys(allFilters).length > 0) {
            requestBody.filters = allFilters;
        }

        // Store current filters globally
        currentFilters = allFilters;

        const response = await fetch(`${apiBase}/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Service not found. Please check your connection.');
            } else if (response.status === 500) {
                throw new Error('Service temporarily unavailable. Please try again later.');
            } else {
                throw new Error('Search failed. Please try again.');
            }
        }

        const data = await response.json();
        renderResults(data.results || []);

        // Show category section after first search
        showCategorySection();

        // Show filter bar after first search
        showFilterBar();
        renderActiveFilters();

        // Emit custom event that search completed
        window.dispatchEvent(new CustomEvent('searchCompleted'));
    } catch (error) {
        console.error('Search error:', error);

        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            renderError('Unable to connect. Please check your internet connection.');
        } else {
            renderError(error.message || 'Unable to search. Please try again.');
        }
    } finally {
        hideLoading();
    }
}

/**
 * Handle search with category filter (convenience wrapper)
 * @param {string} query - Search query
 * @param {string} apiBase - API base URL
 * @param {string|null} categorySlug - Category slug to filter by
 */
export async function handleSearchWithCategory(query, apiBase, categorySlug) {
    return handleSearch(query, apiBase, categorySlug, currentFilters);
}

/**
 * Show filter bar
 */
function showFilterBar() {
    const filterBar = document.getElementById('filter-bar');
    if (filterBar) {
        filterBar.classList.remove('hidden');
    }
}

/**
 * Initialize filter button
 */
export function initializeFilters() {
    const filterButton = document.getElementById('filter-button');
    if (filterButton) {
        filterButton.addEventListener('click', () => {
            showFilterSheet(currentFilters, (newFilters) => {
                // Apply filters and re-run search
                handleSearch(lastQuery, lastApiBase, null, newFilters);
            }, () => {
                // Sheet closed without applying
            });
        });
    }
}

/**
 * Render active filter pills
 */
function renderActiveFilters() {
    const container = document.getElementById('active-filters');
    if (!container) return;

    container.innerHTML = '';

    // Price filter
    if (currentFilters.price_min_cents || currentFilters.price_max_cents) {
        const min = currentFilters.price_min_cents ? `€${(currentFilters.price_min_cents / 100).toFixed(0)}` : 'Min';
        const max = currentFilters.price_max_cents ? `€${(currentFilters.price_max_cents / 100).toFixed(0)}` : 'Max';
        const pill = createFilterPill(`${min} - ${max}`, () => {
            delete currentFilters.price_min_cents;
            delete currentFilters.price_max_cents;
            handleSearch(lastQuery, lastApiBase, null, currentFilters);
        });
        container.appendChild(pill);
    }

    // Stock filter
    if (currentFilters.in_stock_only) {
        const pill = createFilterPill('In Stock Only', () => {
            delete currentFilters.in_stock_only;
            handleSearch(lastQuery, lastApiBase, null, currentFilters);
        });
        container.appendChild(pill);
    }
}

/**
 * Create filter pill element
 */
function createFilterPill(text, onRemove) {
    const pill = document.createElement('div');
    pill.className = 'filter-pill';
    pill.innerHTML = `
        <span>${text}</span>
        <span class="filter-pill-remove">×</span>
    `;
    pill.querySelector('.filter-pill-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        onRemove();
    });
    return pill;
}
