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
            let shouldHideMic = false;

            switch (event.error) {
                case 'no-speech':
                    errorMessage = 'No speech detected. Please try again.';
                    break;
                case 'audio-capture':
                    errorMessage = 'No microphone found. Please check your device.';
                    break;
                case 'not-allowed':
                    errorMessage = 'Microphone blocked. Enable in browser settings.';
                    shouldHideMic = true;
                    console.error('ANDROID: Microphone permission denied or user activation lost');
                    break;
                case 'network':
                    errorMessage = 'Network error. Check connection and try again.';
                    break;
                case 'service-not-allowed':
                    errorMessage = 'Speech service not available. Try again.';
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

            // Hide mic button only for permanent permission denial
            if (shouldHideMic && micButton) {
                micButton.style.display = 'none';
            }

            resetUIToIdle();
        };

        rec.onend = () => {
            console.log('Speech recognition ended');

            if (mode === 'toggle' && isListening) {
                // In toggle mode, if manually stopped, trigger search
                const transcript = searchInput.value.trim();
                if (transcript) {
                    searchInput.classList.remove('transcribing');
                    if (onComplete) {
                        onComplete(transcript);
                    }
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

        // Minimum press duration check (100ms)
        pressStartTime = Date.now();

        // Start recording
        startRecording();

        // Set up hold mode detection (400ms threshold)
        setTimeout(() => {
            if (isListening) {
                mode = 'hold';
                setSearchPillPulsing(true);
                updateStatusText('Listening...');
            }
        }, 400);
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

        // Determine mode based on press duration
        if (pressDuration < 400) {
            // Toggle mode - keep listening
            mode = 'toggle';
            micButton.classList.add('toggle-mode');
            setSearchPillPulsing(false);
            updateStatusText('Listening... Tap to stop');
        } else {
            // Hold mode - stop and search immediately
            mode = 'hold';
            const transcript = searchInput.value.trim();

            stopRecording();
            searchInput.classList.remove('transcribing');

            if (transcript && onComplete) {
                onComplete(transcript);
            }

            resetUIToIdle();
        }
    }

    /**
     * Handle toggle mode second tap (stop)
     */
    function handleToggleStop(e) {
        if (mode === 'toggle' && isListening) {
            e.preventDefault();
            const transcript = searchInput.value.trim();

            stopRecording();
            searchInput.classList.remove('transcribing');

            if (transcript && onComplete) {
                onComplete(transcript);
            }

            resetUIToIdle();
        }
    }

    /**
     * Handle click event (combines pointer events)
     */
    function handleClick(e) {
        if (mode === 'toggle' && isListening) {
            handleToggleStop(e);
        }
    }

    /**
     * Handle keyboard events
     */
    function handleKeyDown(e) {
        if (e.key === ' ' || e.key === 'Enter') {
            if (!isListening) {
                handlePointerDown(e);
            } else if (mode === 'toggle') {
                handleToggleStop(e);
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
