/**
 * Search Logic
 * Handles product search requests
 */

import { showLoading, hideLoading, renderResults, renderError, clearError } from './ui.js';
import { showCategorySection } from './categories.js';

/**
 * Handle product search with optional category filter
 * @param {string} query - Search query
 * @param {string} apiBase - API base URL
 * @param {string|null} categorySlug - Optional category slug to filter by
 */
export async function handleSearch(query, apiBase, categorySlug = null) {
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
        if (categorySlug) {
            requestBody.filters = { category_slug: categorySlug };
        }

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
    return handleSearch(query, apiBase, categorySlug);
}
