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
            console.log('Speech recognition started');
            isListening = true;
        };

        rec.onresult = (event) => {
            let interimTranscript = '';
            let newFinalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    newFinalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            // Update final transcript
            if (newFinalTranscript) {
                finalTranscript += newFinalTranscript;
            }

            // Update input with current transcript
            const currentTranscript = finalTranscript + interimTranscript;
            if (currentTranscript) {
                searchInput.value = currentTranscript;

                // Add transcribing class for interim results
                if (interimTranscript) {
                    searchInput.classList.add('transcribing');
                } else {
                    searchInput.classList.remove('transcribing');
                }

                // Call transcript callback
                if (onTranscript) {
                    onTranscript(currentTranscript);
                }
            }
        };

        rec.onerror = (event) => {
            console.error('Speech recognition error:', event.error);

            let errorMessage = '';
            switch (event.error) {
                case 'no-speech':
                    errorMessage = 'No speech detected. Please try again.';
                    break;
                case 'audio-capture':
                    errorMessage = 'No microphone found. Please check your device.';
                    break;
                case 'not-allowed':
                    errorMessage = 'Microphone access denied. Please enable in browser settings.';
                    // Hide mic button if permission denied
                    if (micButton) {
                        micButton.style.display = 'none';
                    }
                    break;
                case 'network':
                    errorMessage = 'Network error. Please check connection and try again.';
                    break;
                case 'aborted':
                    // Don't show error for manual abort
                    break;
                default:
                    errorMessage = 'Voice search failed. Please try again.';
            }

            if (errorMessage) {
                updateStatusText(errorMessage);
                setTimeout(() => updateStatusText(''), 3000);
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
     */
    function startRecording() {
        try {
            finalTranscript = '';
            recognition = createRecognition();
            recognition.start();

            showVoiceWaves();
            setSearchPillActive(true);
            micButton.classList.add('active');

        } catch (error) {
            console.error('Failed to start recognition:', error);
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
        if (micIcon) micIcon.style.display = 'none';
        if (voiceWaves) voiceWaves.classList.remove('hidden');
    }

    function hideVoiceWaves() {
        if (micIcon) micIcon.style.display = 'block';
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
        micButton.classList.remove('active', 'toggle-mode');
        searchInput.classList.remove('transcribing');
        updateStatusText('');
        mode = null;
        isListening = false;
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
