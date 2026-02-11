/**
 * Main Application Entry Point
 * Initializes the shopping interface and handles search events
 */

import { handleSearch } from './search.js';
import { renderError, clearError } from './ui.js';
import { initVoiceSearch } from './voice-search.js';

// Get API base URL from current domain (white-label compatible)
const API_BASE = window.location.origin + '/api';

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');
    const micButton = document.getElementById('mic-button');
    const searchPill = document.querySelector('.search-pill');
    const clearButton = document.getElementById('clear-button');

    // Initialize pill in centered state
    if (searchPill) {
        searchPill.classList.add('centered');
    }

    // Handle search on Enter key
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const query = searchInput.value.trim();
            if (query) {
                handleSearch(query, API_BASE);
            }
        }
    });

    // Track button state
    let buttonMode = 'search'; // 'search' or 'clear'

    // Handle search/clear button click (morphing button)
    searchButton.addEventListener('click', () => {
        if (buttonMode === 'clear') {
            // Clear mode: reset everything
            searchInput.value = '';
            clearButton.classList.add('hidden');
            resetSearchState();
        } else {
            // Search mode: perform search
            const query = searchInput.value.trim();
            if (query) {
                handleSearch(query, API_BASE);
            }
        }
    });

    // Show/hide clear button based on input content OR results visibility
    searchInput.addEventListener('input', () => {
        clearError();
        const resultsSection = document.getElementById('results-section');
        const hasResults = resultsSection && !resultsSection.classList.contains('hidden');

        // Show clear button if there's text OR if results are visible
        if (searchInput.value.trim().length > 0 || hasResults) {
            clearButton.classList.remove('hidden');
        } else {
            clearButton.classList.add('hidden');
        }
    });

    // Clear button click handler
    clearButton.addEventListener('click', () => {
        searchInput.value = '';
        clearButton.classList.add('hidden');

        // If voice is active, stop it
        if (window.voiceSearchInstance && window.voiceSearchInstance.isListening()) {
            window.voiceSearchInstance.stop();
        }

        // Trigger reset animation (move pill back to center, hide results)
        resetSearchState();
    });

    // Initialize voice search
    if (micButton) {
        initVoiceSearch(
            searchInput,
            micButton,
            searchPill,
            // onTranscript callback - updates input as user speaks
            (transcript) => {
                searchInput.value = transcript;
                searchInput.classList.add('transcribing');
            },
            // onComplete callback - triggers search with final transcript
            (finalTranscript) => {
                searchInput.classList.remove('transcribing');
                if (finalTranscript.trim()) {
                    handleSearch(finalTranscript.trim(), API_BASE);
                }
            }
        );
    }

    // Morph button to Search mode
    function morphButtonToSearch() {
        buttonMode = 'search';
        searchButton.textContent = 'Search';
        searchButton.classList.remove('clear-mode');
    }

    // Morph button to Clear mode
    function morphButtonToClear() {
        buttonMode = 'clear';
        searchButton.textContent = 'Clear';
        searchButton.classList.add('clear-mode');
    }

    // Reset search state - return pill to center, hide results
    function resetSearchState() {
        const resultsSection = document.getElementById('results-section');
        const trustIndicators = document.querySelector('.trust-indicators');

        // Remove sticky, add centered (triggers CSS transition)
        searchPill.classList.remove('sticky');
        searchPill.classList.add('centered');

        // Show trust indicators again
        if (trustIndicators) {
            trustIndicators.classList.remove('hidden-for-results');
        }

        // Hide clear button when returning to centered state
        clearButton.classList.add('hidden');

        // Morph button back to Search
        morphButtonToSearch();

        // Fade out results simultaneously (using setTimeout for slight delay)
        setTimeout(() => {
            resultsSection.classList.add('hidden');
        }, 100);
    }

    // Listen for custom resetSearchState event (triggered by auto-reset timer)
    window.addEventListener('resetSearchState', resetSearchState);

    // Listen for morphButton event (triggered when results are displayed)
    window.addEventListener('morphButtonToClear', morphButtonToClear);


    // Global error handler
    window.addEventListener('error', (e) => {
        console.error('Global error:', e.error);
        renderError('Something went wrong. Please try again.');
    });

    console.log('App initialized');
});
