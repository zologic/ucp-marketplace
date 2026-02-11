/**
 * Voice Search Module
 * Implements Web Speech API for voice search functionality
 * Supports both hold-to-speak and toggle modes
 */

// Check browser compatibility
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
    console.warn('Web Speech API not supported in this browser');
}

/**
 * Initialize voice search functionality
 * @param {HTMLInputElement} searchInput - The search input element
 * @param {HTMLButtonElement} micButton - The microphone button element
 * @param {HTMLElement} searchPill - The search pill container element
 * @param {Function} onTranscript - Callback for interim transcripts
 * @param {Function} onComplete - Callback for final transcript and search trigger
 * @returns {Object|null} Voice search controller or null if not supported
 */
export function initVoiceSearch(searchInput, micButton, searchPill, onTranscript, onComplete) {
    console.log('=== Initializing Voice Search ===');
    console.log('SpeechRecognition available:', !!SpeechRecognition);
    console.log('webkitSpeechRecognition available:', !!window.webkitSpeechRecognition);
    console.log('User agent:', navigator.userAgent);

    if (!SpeechRecognition) {
        console.error('Web Speech API not supported');
        // Hide mic button if Web Speech API not supported
        if (micButton) {
            micButton.style.display = 'none';
        }
        return null;
    }

    console.log('Voice search initialized successfully');

    // Detect Android
    const isAndroid = /Android/i.test(navigator.userAgent);

    // State management
    let recognition = null;
    let isListening = false;
    let isButtonHeld = false; // Track if button is currently being held
    let pressStartTime = 0;
    let mode = null; // 'hold' or 'toggle'
    let finalTranscript = '';
    let recognitionStartTime = 0; // Track when recognition actually started
    let restartAttempts = 0; // Track restart attempts to prevent infinite loop

    // Get UI elements
    const voiceWaves = micButton.querySelector('.voice-waves');
    const micIcon = micButton.querySelector('.fa-microphone');
    const voiceStatus = document.getElementById('voice-status');

    /**
     * Initialize speech recognition
     */
    function createRecognition() {
        const rec = new SpeechRecognition();

        // Recommended configuration for Android stability
        rec.continuous = false;      // Prevents immediate stop on Android
        rec.interimResults = false;  // Simpler, more stable on Android
        rec.lang = 'en-US';
        rec.maxAlternatives = 1;

        rec.onstart = () => {
            console.log('✓ Speech recognition ONSTART fired');
            recognitionStartTime = Date.now(); // Track start time

            // ANDROID: Confirm to user that mic is active
            updateStatusText('🎤 Listening...');
        };

        rec.onresult = (event) => {
            // Simple single-shot mode - just get the final result
            const transcript = event.results[0][0].transcript;
            console.log('✓ ONRESULT fired with transcript:', transcript);

            // Update input with transcript
            searchInput.value = transcript;
            finalTranscript = transcript;

            // Call transcript callback
            if (transcript && onTranscript) {
                console.log('Calling onTranscript callback');
                onTranscript(transcript);
            }
        };

        rec.onerror = (event) => {
            console.error('✗ ONERROR fired:', event.error, event);
            console.error('Error details - isButtonHeld:', isButtonHeld, 'restartAttempts:', restartAttempts);

            let errorMessage = '';

            switch (event.error) {
                case 'no-speech':
                    // Ignore on button hold - will auto-restart
                    if (isButtonHeld) {
                        console.log('No speech detected, will retry while button held');
                        return;
                    }
                    errorMessage = 'No speech detected. Please try again.';
                    break;
                case 'audio-capture':
                    errorMessage = 'No microphone found. Please check your device.';
                    break;
                case 'not-allowed':
                    // ANDROID FIX: Don't hide button - just show error and let user retry
                    errorMessage = 'Microphone blocked. Enable in settings and try again.';
                    console.error('ANDROID: Microphone permission denied or user activation lost');
                    break;
                case 'network':
                    errorMessage = 'Network error. Check connection and try again.';
                    break;
                case 'service-not-allowed':
                    // ANDROID FIX: Don't hide button on this error - just let user retry
                    errorMessage = 'Voice service unavailable. Please try again.';
                    console.error('ANDROID: Speech service rejected - may be user activation issue');
                    break;
                case 'aborted':
                    // Manual abort - no error message needed
                    console.log('Speech recognition manually aborted');
                    break;
                default:
                    errorMessage = 'Voice search failed. Please try again.';
                    console.error('ANDROID: Unknown error -', event.error);
            }

            // Show error message to user
            if (errorMessage) {
                updateStatusText('⚠️ ' + errorMessage);
                setTimeout(() => updateStatusText(''), 4000);
            }

            // ANDROID FIX: Never hide the mic button - just reset UI state
            // Let the browser handle permanent permission blocking
            resetUIToIdle();
        };

        rec.onend = () => {
            const recognitionDuration = Date.now() - recognitionStartTime;
            console.log('✓ ONEND fired - duration:', recognitionDuration + 'ms', 'isButtonHeld:', isButtonHeld, 'restartAttempts:', restartAttempts);

            // Get current transcript
            const transcript = searchInput.value.trim();
            console.log('Current transcript:', transcript);

            // If button still held, restart for continuous recording
            if (isButtonHeld && restartAttempts < 10) {
                console.log('→ Button still held, restarting recognition (attempt', restartAttempts + 1, ')');
                restartAttempts++;

                // Restart recognition immediately
                try {
                    recognition = createRecognition();
                    recognition.start();
                    console.log('→ Restart successful');
                    // Keep UI in recording state - don't reset
                    return;
                } catch (error) {
                    console.error('→ Restart failed:', error);
                    // Fall through to normal cleanup
                }
            }

            // Reset restart attempts
            restartAttempts = 0;

            // Trigger search if we have transcript
            if (transcript && onComplete) {
                console.log('→ Triggering search with transcript:', transcript);
                searchInput.classList.remove('transcribing');
                onComplete(transcript);
            } else {
                console.log('→ No transcript to search, or no onComplete callback');
            }

            console.log('→ Cleaning up and resetting UI');
            isListening = false;
            isButtonHeld = false;
            resetUIToIdle();
        };

        return rec;
    }

    // startRecording() removed - inlined into handlePointerDown for immediate execution

    /**
     * Stop recording
     */
    function stopRecording() {
        if (recognition) {
            recognition.stop();
            recognition = null;
        }
    }

    /**
     * UI state functions
     */
    function showVoiceWaves() {
        // ANDROID FIX: Keep mic icon visible, just add pulsing animation via CSS
        // Don't hide the icon - it provides visual feedback that mic is active
        // The CSS .mic-button.active class handles the visual state
        if (voiceWaves) voiceWaves.classList.remove('hidden');
    }

    function hideVoiceWaves() {
        if (voiceWaves) voiceWaves.classList.add('hidden');
    }

    function setSearchPillActive(active) {
        if (searchPill) {
            searchPill.classList.toggle('active', active);
        }
    }

    function setSearchPillPulsing(pulsing) {
        if (searchPill) {
            searchPill.classList.toggle('pulsing', pulsing);
        }
    }

    function updateStatusText(text) {
        if (voiceStatus) {
            if (text) {
                voiceStatus.textContent = text;
                voiceStatus.classList.remove('hidden');
            } else {
                voiceStatus.classList.add('hidden');
            }
        }
    }

    function resetUIToIdle() {
        hideVoiceWaves();
        setSearchPillActive(false);
        setSearchPillPulsing(false);
        micButton.classList.remove('active', 'toggle-mode', 'recording');
        searchInput.classList.remove('transcribing');
        updateStatusText('');
        mode = null;
        isListening = false;
        isButtonHeld = false;
        restartAttempts = 0;

        // Ensure mic icon is visible after reset
        if (micIcon) {
            micIcon.style.removeProperty('display');
        }
    }

    /**
     * Handle pointer down (start press)
     * CRITICAL: recognition.start() must be ABSOLUTE FIRST for Android User Activation
     */
    function handlePointerDown(e) {
        console.log('handlePointerDown triggered');
        e.preventDefault();

        // Early exit if already listening
        if (isListening) {
            console.log('Already listening, ignoring');
            return;
        }

        // CRITICAL: Set state BEFORE start() so onend can see it
        isButtonHeld = true;
        restartAttempts = 0;
        pressStartTime = Date.now();
        console.log('State set BEFORE start, isButtonHeld:', isButtonHeld);

        // Create recognition object
        console.log('Creating recognition object');
        finalTranscript = '';
        recognition = createRecognition();

        if (!recognition) {
            console.error('Failed to create recognition object');
            updateStatusText('Voice search not available');
            isButtonHeld = false;
            return;
        }

        // CRITICAL: START IMMEDIATELY
        console.log('Attempting to start recognition...');
        try {
            recognition.start();
            console.log('Recognition.start() called successfully');
        } catch (error) {
            console.error('Failed to start recognition:', error);
            updateStatusText('Failed to start voice search: ' + error.message);
            setTimeout(() => updateStatusText(''), 3000);
            isButtonHeld = false;
            return;
        }

        // Set listening state AFTER start() succeeds
        isListening = true;
        console.log('isListening set to true');

        // UI updates AFTER start() is called
        showVoiceWaves();
        setSearchPillActive(true);
        micButton.classList.add('active');
        micButton.classList.add('recording');
        console.log('UI updated');
    }

    /**
     * Handle pointer up (release press)
     */
    function handlePointerUp(e) {
        console.log('handlePointerUp triggered');
        e.preventDefault();

        // Mark button as released
        isButtonHeld = false;
        console.log('Button released, isButtonHeld:', isButtonHeld);

        const pressDuration = Date.now() - pressStartTime;
        console.log('Press duration:', pressDuration + 'ms');

        // Ignore very rapid taps (<100ms) as accidental
        if (pressDuration < 100) {
            console.log('Too short press, ignoring');
            stopRecording();
            resetUIToIdle();
            return;
        }

        // Always stop recording on release - onend will trigger search
        console.log('Stopping recording');
        stopRecording();
    }

    /**
     * Handle click event (no-op for simple press/release)
     */
    function handleClick(e) {
        // Click is handled by pointerdown + pointerup
        // No additional action needed
    }

    /**
     * Handle keyboard events
     */
    function handleKeyDown(e) {
        if (e.key === ' ' || e.key === 'Enter') {
            if (!isListening) {
                handlePointerDown(e);
            } else {
                // Release: stop recording, onend will trigger search
                stopRecording();
            }
        } else if (e.key === 'Escape') {
            if (isListening) {
                stopRecording();
                resetUIToIdle();
            }
        }
    }

    /**
     * Handle Enter key in search input (stop voice and search)
     */
    function handleSearchInputKeyPress(e) {
        if (e.key === 'Enter' && isListening) {
            const transcript = searchInput.value.trim();
            stopRecording();
            resetUIToIdle();

            if (transcript && onComplete) {
                onComplete(transcript);
            }
        }
    }

    /**
     * Handle window blur (stop recording if focus lost)
     */
    function handleWindowBlur() {
        if (isListening) {
            stopRecording();
            updateStatusText('Recording stopped (window lost focus)');
            setTimeout(() => updateStatusText(''), 3000);
            resetUIToIdle();
        }
    }

    // Attach event listeners
    micButton.addEventListener('pointerdown', handlePointerDown);
    micButton.addEventListener('pointerup', handlePointerUp);
    micButton.addEventListener('click', handleClick);
    micButton.addEventListener('keydown', handleKeyDown);
    searchInput.addEventListener('keypress', handleSearchInputKeyPress);
    window.addEventListener('blur', handleWindowBlur);

    // Make mic button focusable
    micButton.setAttribute('tabindex', '0');

    console.log('Voice search initialized');

    // Return cleanup function
    return {
        cleanup: () => {
            if (recognition) {
                recognition.stop();
                recognition = null;
            }
            resetUIToIdle();

            // Remove event listeners
            micButton.removeEventListener('pointerdown', handlePointerDown);
            micButton.removeEventListener('pointerup', handlePointerUp);
            micButton.removeEventListener('click', handleClick);
            micButton.removeEventListener('keydown', handleKeyDown);
            searchInput.removeEventListener('keypress', handleSearchInputKeyPress);
            window.removeEventListener('blur', handleWindowBlur);
        }
    };
}
