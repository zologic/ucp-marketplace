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

    // Handle search on Enter key
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const query = searchInput.value.trim();
            if (query) {
                handleSearch(query, API_BASE);
            }
        }
    });

    // Handle search on button click
    searchButton.addEventListener('click', () => {
        const query = searchInput.value.trim();
        if (query) {
            handleSearch(query, API_BASE);
        }
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

    // Clear errors when typing
    searchInput.addEventListener('input', () => {
        clearError();
    });

    // Global error handler
    window.addEventListener('error', (e) => {
        console.error('Global error:', e.error);
        renderError('Something went wrong. Please try again.');
    });

    console.log('App initialized');
});
