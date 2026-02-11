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
    if (!SpeechRecognition) {
        // Hide mic button if Web Speech API not supported
        if (micButton) {
            micButton.style.display = 'none';
        }
        return null;
    }

    // State management
    let recognition = null;
    let isListening = false;
    let pressStartTime = 0;
    let mode = null; // 'hold' or 'toggle'
    let finalTranscript = '';
    let recognitionStartTime = 0; // Track when recognition actually started

    // Get UI elements
    const voiceWaves = micButton.querySelector('.voice-waves');
    const micIcon = micButton.querySelector('.fa-microphone');
    const voiceStatus = document.getElementById('voice-status');

    /**
     * Initialize speech recognition
     */
    function createRecognition() {
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = 'en-US';
        rec.maxAlternatives = 1;

        rec.onstart = () => {
            console.log('Speech recognition started successfully');
            isListening = true;
            recognitionStartTime = Date.now(); // Track start time

            // ANDROID: Confirm to user that mic is active
            updateStatusText('🎤 Listening...');
        };

        rec.onresult = (event) => {
            let interimTranscript = '';
            let newFinalTranscript = '';

            // Process all results from this event
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    newFinalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            // Update final transcript accumulator
            if (newFinalTranscript) {
                finalTranscript += newFinalTranscript;
                console.log('Final transcript:', finalTranscript);
            }

            // Build complete current transcript
            const currentTranscript = finalTranscript + interimTranscript;

            // ANDROID FIX: Always update input immediately, even with empty transcript
            // to show that speech recognition is working
            searchInput.value = currentTranscript;

            // Visual feedback for interim vs final results
            if (interimTranscript) {
                searchInput.classList.add('transcribing');
                // Show interim text in status for Android feedback
                updateStatusText('Listening: "' + currentTranscript + '"');
            } else if (newFinalTranscript) {
                searchInput.classList.remove('transcribing');
                updateStatusText('');
            }

            // Call transcript callback for any text
            if (currentTranscript && onTranscript) {
                onTranscript(currentTranscript);
            }

            // ANDROID: Log to help debug
            if (interimTranscript || newFinalTranscript) {
                console.log('Voice result:', {
                    interim: interimTranscript,
                    final: newFinalTranscript,
                    total: currentTranscript
                });
            }
        };

        rec.onerror = (event) => {
            console.error('Speech recognition error:', event.error, event);

            let errorMessage = '';

            switch (event.error) {
                case 'no-speech':
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
            console.log('Speech recognition ended', { duration: recognitionDuration + 'ms' });

            // Get current transcript
            const transcript = searchInput.value.trim();

            // ANDROID FIX: If recognition ended quickly but we have transcript, trigger search
            if (recognitionDuration < 500 && isListening) {
                console.warn('ANDROID: Recognition ended prematurely after', recognitionDuration, 'ms');

                // If we have transcript, trigger search immediately
                if (transcript && onComplete) {
                    console.log('ANDROID: Triggering search with transcript:', transcript);
                    searchInput.classList.remove('transcribing');
                    onComplete(transcript);
                    isListening = false;
                    resetUIToIdle();
                    return;
                }

                // No transcript yet - keep UI in listening state briefly
                setTimeout(() => {
                    if (isListening) {
                        const delayedTranscript = searchInput.value.trim();
                        if (delayedTranscript && onComplete) {
                            console.log('ANDROID: Late transcript found, triggering search');
                            searchInput.classList.remove('transcribing');
                            onComplete(delayedTranscript);
                        }
                        isListening = false;
                        resetUIToIdle();
                    }
                }, 300);
                return;
            }

            // Normal flow: trigger search if we have transcript
            if (transcript) {
                searchInput.classList.remove('transcribing');
                if (onComplete) {
                    console.log('Triggering search with transcript:', transcript);
                    onComplete(transcript);
                }
            }

            isListening = false;
            resetUIToIdle();
        };

        return rec;
    }

    /**
     * Start recording
     * CRITICAL: recognition.start() must be called immediately for Android
     */
    function startRecording() {
        try {
            finalTranscript = '';
            recognition = createRecognition();

            // CRITICAL FOR ANDROID: Start recognition immediately in user gesture
            // Any delay breaks Android's user activation requirement
            recognition.start();

            // UI updates can happen after start() is called
            showVoiceWaves();
            setSearchPillActive(true);
            micButton.classList.add('active');
            micButton.classList.add('recording');

        } catch (error) {
            console.error('Failed to start recognition:', error);
            updateStatusText('Voice search failed. Please try again.');
            setTimeout(() => updateStatusText(''), 3000);
            resetUIToIdle();
        }
    }

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

        // Ensure mic icon is visible after reset
        if (micIcon) {
            micIcon.style.removeProperty('display');
        }
    }

    /**
     * Handle pointer down (start press)
     */
    function handlePointerDown(e) {
        e.preventDefault();

        // Ignore if already listening
        if (isListening) return;

        // Track press start time for minimum duration check
        pressStartTime = Date.now();

        // Start recording immediately
        startRecording();
    }

    /**
     * Handle pointer up (release press)
     */
    function handlePointerUp(e) {
        e.preventDefault();

        const pressDuration = Date.now() - pressStartTime;

        // Ignore very rapid taps (<100ms) as accidental
        if (pressDuration < 100) {
            stopRecording();
            resetUIToIdle();
            return;
        }

        // Always stop recording on release - onend will trigger search
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
