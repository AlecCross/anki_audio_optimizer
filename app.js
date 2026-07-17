document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // 1. PWA & CORE UI SETUP
    // =========================================================================
    const connectionStatusBadge = document.getElementById('connectionStatus');
    const statusText = connectionStatusBadge.querySelector('.status-text');
    const installPwaBtn = document.getElementById('installPwaBtn');
    
    // Diagnostics Elements
    const diagSwStatus = document.getElementById('diagSwStatus');
    const diagNetworkStatus = document.getElementById('diagNetworkStatus');
    const diagSecureContext = document.getElementById('diagSecureContext');
    const diagPwaSupport = document.getElementById('diagPwaSupport');
    
    // Action Buttons & Modals
    const checkSwBtn = document.getElementById('checkSwBtn');
    const simulateOfflineBtn = document.getElementById('simulateOfflineBtn');
    const adviceModal = document.getElementById('adviceModal');
    const closeModalBtn = document.getElementById('closeModalBtn');

    let deferredPrompt;

    // Update connection status
    function updateOnlineStatus() {
        const isOnline = navigator.onLine;
        if (isOnline) {
            connectionStatusBadge.classList.remove('offline');
            connectionStatusBadge.classList.add('online');
            statusText.textContent = 'Онлайн';
        } else {
            connectionStatusBadge.classList.remove('online');
            connectionStatusBadge.classList.add('offline');
            statusText.textContent = 'Офлайн';
        }
        diagNetworkStatus.textContent = isOnline ? 'Підключено' : 'Автономний (Офлайн)';
        diagNetworkStatus.className = 'diag-val ' + (isOnline ? 'status-success' : 'status-error');
    }

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus(); // Initial check

    // Check secure context
    const isSecure = window.isSecureContext;
    diagSecureContext.textContent = isSecure ? 'Так (Secure Context)' : 'Ні (Потрібно HTTPS/localhost)';
    diagSecureContext.className = 'diag-val ' + (isSecure ? 'status-success' : 'status-error');

    // Check PWA support
    const pwaSupported = ('serviceWorker' in navigator) && ('BeforeInstallPromptEvent' in window || !isMobileiOS());
    diagPwaSupport.textContent = pwaSupported ? 'Підтримується' : 'Обмежена (Safari iOS або старий браузер)';
    diagPwaSupport.className = 'diag-val ' + (pwaSupported ? 'status-success' : 'status-pending');

    function isMobileiOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    }

    // Register Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => {
                    console.log('SW Registered with scope:', registration.scope);
                    updateSwDiagStatus(registration);
                    
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed') {
                                console.log('Новий сервіс-воркер встановлено. Перезапустіть сторінку.');
                                updateSwDiagStatus(registration);
                            }
                        });
                    });
                })
                .catch(error => {
                    console.error('Service Worker registration failed:', error);
                    diagSwStatus.textContent = 'Помилка реєстрації';
                    diagSwStatus.className = 'diag-val status-error';
                });
        });
    } else {
        diagSwStatus.textContent = 'Не підтримується';
        diagSwStatus.className = 'diag-val status-error';
    }

    function updateSwDiagStatus(registration) {
        if (!registration) {
            diagSwStatus.textContent = 'Відсутній';
            diagSwStatus.className = 'diag-val status-error';
            return;
        }
        if (registration.active) {
            diagSwStatus.textContent = 'Активний';
            diagSwStatus.className = 'diag-val status-success';
        } else if (registration.installing) {
            diagSwStatus.textContent = 'Встановлення...';
            diagSwStatus.className = 'diag-val status-pending';
        } else if (registration.waiting) {
            diagSwStatus.textContent = 'Очікування активації';
            diagSwStatus.className = 'diag-val status-pending';
        }
    }

    // PWA Installation Prompts
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        installPwaBtn.classList.remove('hidden');
    });

    installPwaBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to install: ${outcome}`);
        deferredPrompt = null;
        installPwaBtn.classList.add('hidden');
    });

    window.addEventListener('appinstalled', () => {
        console.log('App installed successfully');
        installPwaBtn.classList.add('hidden');
        alert('Застосунок успішно встановлено!');
    });

    // Modals & Diagnostic Action Buttons
    simulateOfflineBtn.addEventListener('click', () => adviceModal.classList.remove('hidden'));
    closeModalBtn.addEventListener('click', () => adviceModal.classList.add('hidden'));
    adviceModal.addEventListener('click', (e) => { if (e.target === adviceModal) adviceModal.classList.add('hidden'); });

    checkSwBtn.addEventListener('click', () => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistration().then(registration => {
                if (registration) {
                    updateSwDiagStatus(registration);
                    let statusTextStr = `Сервіс-воркер активний.\nScope: ${registration.scope}`;
                    if (registration.waiting) statusTextStr += '\nЄ оновлення, яке очікує активації.';
                    alert(statusTextStr);
                } else {
                    alert('Сервіс-воркер не зареєстрований.');
                }
            });
        } else {
            alert('Сервіс-воркер не підтримується.');
        }
    });

    // =========================================================================
    // 2. AUDIO PROCESSING & INTERACTIVE EDITOR LOGIC
    // =========================================================================
    
    // Core Audio Variables
    let audioContext = null;
    let audioBuffer = null;
    let originalFile = null;

    // Playback State
    let playbackSourceNode = null;
    let playbackStartTime = 0;
    let playbackOffset = 0;
    let isPlaying = false;
    let playheadIntervalId = null;
    let pausedPosition = null;

    // DOM Elements - Editor
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('audioVideoInput');
    const fileSelectBtn = document.getElementById('fileSelectBtn');
    const statusIndicator = document.getElementById('statusIndicator');
    const statusMessage = document.getElementById('statusMessage');
    const progressBarContainer = document.getElementById('progressBarContainer');
    const progressBarFill = document.getElementById('progressBarFill');
    const editorSection = document.getElementById('editorSection');
    
    const fileNameDisplay = document.getElementById('fileName');
    const fileDurationDisplay = document.getElementById('fileDuration');
    
    const waveformCanvas = document.getElementById('waveformCanvas');
    const playhead = document.getElementById('playhead');
    
    const trimStartInput = document.getElementById('trimStartInput');
    const trimEndInput = document.getElementById('trimEndInput');
    const trimDurationVal = document.getElementById('trimDurationVal');
    
    const rangeStartSlider = document.getElementById('rangeStartSlider');
    const rangeEndSlider = document.getElementById('rangeEndSlider');
    const sliderTrack = document.getElementById('sliderTrack');
    
    const playBtn = document.getElementById('playBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const stopBtn = document.getElementById('stopBtn');
    const loopCheckbox = document.getElementById('loopCheckbox');
    
    const qualityPreset = document.getElementById('qualityPreset');
    const volumeBoost = document.getElementById('volumeBoost');
    const volumeBoostVal = document.getElementById('volumeBoostVal');
    
    const convertBtn = document.getElementById('convertBtn');
    const clearFileBtn = document.getElementById('clearFileBtn');

    // DOM Elements - Result
    const resultSection = document.getElementById('resultSection');
    const originalSizeVal = document.getElementById('originalSizeVal');
    const optimizedSizeVal = document.getElementById('optimizedSizeVal');
    const compressionRatioVal = document.getElementById('compressionRatioVal');
    const resultAudioPlayer = document.getElementById('resultAudioPlayer');
    const downloadResultBtn = document.getElementById('downloadResultBtn');
    const backToEditorBtn = document.getElementById('backToEditorBtn');

    // Lazy AudioContext Initialization
    function initAudioContext() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
    }

    // --- File Input Listeners ---
    fileSelectBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFileSelected(e.target.files[0]);
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFileSelected(e.dataTransfer.files[0]);
        }
    });

    // Handle selected audio/video file
    function handleFileSelected(file) {
        originalFile = file;

        // Reset UI States
        dropZone.classList.add('hidden');
        resultSection.classList.add('hidden');
        editorSection.classList.add('hidden');
        statusIndicator.classList.remove('hidden');
        progressBarContainer.classList.add('hidden');
        statusMessage.textContent = 'Зчитування файлу...';

        // Clear any previous playback
        stopPlayback(true);

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                statusMessage.textContent = 'Декодування аудіо-даних (це може зайняти кілька секунд)...';
                initAudioContext();

                const arrayBuffer = e.target.result;
                // decodeAudioData handles extract track from video automatically
                audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

                setupEditor();

                statusIndicator.classList.add('hidden');
                editorSection.classList.remove('hidden');
            } catch (err) {
                console.error('Decoding error:', err);
                statusMessage.textContent = 'Не вдалося декодувати файл. Будь ласка, перевірте формат або спробуйте інший файл.';
                
                // Add a failure retry button inside status panel
                const retryBtn = document.createElement('button');
                retryBtn.className = 'btn btn-outline';
                retryBtn.style.marginTop = '1rem';
                retryBtn.textContent = 'Спробувати знову';
                retryBtn.onclick = () => {
                    statusIndicator.classList.add('hidden');
                    dropZone.classList.remove('hidden');
                    retryBtn.remove();
                };
                statusIndicator.appendChild(retryBtn);
            }
        };
        reader.onerror = (err) => {
            console.error('File reading error:', err);
            alert('Помилка при читанні файлу з диска.');
            statusIndicator.classList.add('hidden');
            dropZone.classList.remove('hidden');
        };
        reader.readAsArrayBuffer(file);
    }

    // Set up workspace variables after file decoding
    function setupEditor() {
        const duration = audioBuffer.duration;

        fileNameDisplay.textContent = originalFile.name;
        fileDurationDisplay.textContent = formatTime(duration);

        // Configure sliders max limit
        rangeStartSlider.max = duration;
        rangeEndSlider.max = duration;
        rangeStartSlider.value = 0;
        rangeEndSlider.value = duration;

        // Configure manual inputs
        trimStartInput.max = duration;
        trimEndInput.max = duration;
        trimStartInput.value = "0.00";
        trimEndInput.value = duration.toFixed(2);

        updateSliderTrack();
        updateTrimDuration();

        // Render waveform
        setTimeout(drawWaveform, 50);
    }

    // --- Waveform Drawing ---
    function drawWaveform() {
        if (!audioBuffer) return;

        const ctx = waveformCanvas.getContext('2d');
        const rect = waveformCanvas.parentNode.getBoundingClientRect();
        
        // Match canvas layout width for pixel-perfect sharpness
        waveformCanvas.width = rect.width * window.devicePixelRatio;
        waveformCanvas.height = rect.height * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

        const width = rect.width;
        const height = rect.height;

        ctx.clearRect(0, 0, width, height);

        const channelData = audioBuffer.getChannelData(0);
        const step = Math.ceil(channelData.length / width);
        const amp = height / 2;

        const startVal = parseFloat(rangeStartSlider.value);
        const endVal = parseFloat(rangeEndSlider.value);
        const duration = audioBuffer.duration;

        // Draw baseline
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        // Draw peaks
        for (let i = 0; i < width; i++) {
            let min = 1.0;
            let max = -1.0;

            for (let j = 0; j < step; j++) {
                const index = i * step + j;
                if (index < channelData.length) {
                    const val = channelData[index];
                    if (val < min) min = val;
                    if (val > max) max = val;
                }
            }

            const timePos = (i / width) * duration;
            const isSelected = timePos >= startVal && timePos <= endVal;

            if (isSelected) {
                const grad = ctx.createLinearGradient(0, amp + min * amp, 0, amp + max * amp);
                grad.addColorStop(0, '#a78bfa'); // Purple
                grad.addColorStop(1, '#ec4899'); // Pink Accent
                ctx.fillStyle = grad;
            } else {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'; // Gray out unselected
            }

            const barHeight = Math.max(2, (max - min) * amp);
            const y = amp - barHeight / 2;
            ctx.fillRect(i, y, 1.8, barHeight);
        }
    }

    // Redraw waveform on window resize
    window.addEventListener('resize', () => {
        if (audioBuffer && !editorSection.classList.contains('hidden')) {
            drawWaveform();
        }
    });

    // --- Slider & UI Value Sync ---
    function updateSliderTrack() {
        const startVal = parseFloat(rangeStartSlider.value);
        const endVal = parseFloat(rangeEndSlider.value);
        const duration = audioBuffer ? audioBuffer.duration : 100;
        
        const startPercent = (startVal / duration) * 100;
        const endPercent = (endVal / duration) * 100;

        sliderTrack.style.background = `linear-gradient(to right, 
            rgba(255, 255, 255, 0.05) ${startPercent}%, 
            var(--primary-color) ${startPercent}%, 
            var(--primary-color) ${endPercent}%, 
            rgba(255, 255, 255, 0.05) ${endPercent}%)`;
    }

    function updateTrimDuration() {
        const startVal = parseFloat(rangeStartSlider.value);
        const endVal = parseFloat(rangeEndSlider.value);
        const diff = Math.max(0, endVal - startVal);
        trimDurationVal.textContent = diff.toFixed(2) + ' с';
    }

    // Volume boost label update
    volumeBoost.addEventListener('input', () => {
        volumeBoostVal.textContent = parseFloat(volumeBoost.value).toFixed(1) + 'x';
    });

    // Sync Dual range sliders
    rangeStartSlider.addEventListener('input', () => {
        let startVal = parseFloat(rangeStartSlider.value);
        const endVal = parseFloat(rangeEndSlider.value);

        if (startVal >= endVal - 0.05) {
            startVal = Math.max(0, endVal - 0.05);
            rangeStartSlider.value = startVal;
        }

        trimStartInput.value = startVal.toFixed(2);
        updateSliderTrack();
        updateTrimDuration();
        drawWaveform();
        if (isPlaying) stopPlayback(false); // Stop playback to avoid offset glitches
    });

    rangeEndSlider.addEventListener('input', () => {
        const startVal = parseFloat(rangeStartSlider.value);
        let endVal = parseFloat(rangeEndSlider.value);
        const duration = audioBuffer ? audioBuffer.duration : 100;

        if (endVal <= startVal + 0.05) {
            endVal = Math.min(duration, startVal + 0.05);
            rangeEndSlider.value = endVal;
        }

        trimEndInput.value = endVal.toFixed(2);
        updateSliderTrack();
        updateTrimDuration();
        drawWaveform();
        if (isPlaying) stopPlayback(false);
    });

    // Sync Manual Input fields
    trimStartInput.addEventListener('change', () => {
        let startVal = parseFloat(trimStartInput.value) || 0;
        const endVal = parseFloat(rangeEndSlider.value);

        if (startVal < 0) startVal = 0;
        if (startVal >= endVal - 0.05) startVal = Math.max(0, endVal - 0.05);

        trimStartInput.value = startVal.toFixed(2);
        rangeStartSlider.value = startVal;
        updateSliderTrack();
        updateTrimDuration();
        drawWaveform();
        if (isPlaying) stopPlayback(false);
    });

    trimEndInput.addEventListener('change', () => {
        const startVal = parseFloat(rangeStartSlider.value);
        const duration = audioBuffer ? audioBuffer.duration : 100;
        let endVal = parseFloat(trimEndInput.value) || duration;

        if (endVal > duration) endVal = duration;
        if (endVal <= startVal + 0.05) endVal = Math.min(duration, startVal + 0.05);

        trimEndInput.value = endVal.toFixed(2);
        rangeEndSlider.value = endVal;
        updateSliderTrack();
        updateTrimDuration();
        drawWaveform();
        if (isPlaying) stopPlayback(false);
    });


    // --- Playback Engine (Web Audio API) ---
    playBtn.addEventListener('click', startPlayback);
    pauseBtn.addEventListener('click', pausePlayback);
    stopBtn.addEventListener('click', () => stopPlayback(true));

    function startPlayback() {
        if (!audioBuffer) return;

        initAudioContext();
        stopPlayback(false); // Reset current node

        const startVal = parseFloat(rangeStartSlider.value);
        const endVal = parseFloat(rangeEndSlider.value);
        const totalDuration = audioBuffer.duration;

        // Resume from paused position if available, else startVal
        let startOffset = (pausedPosition !== null) ? pausedPosition : startVal;
        if (startOffset >= endVal) startOffset = startVal;

        const playLength = endVal - startOffset;
        if (playLength <= 0.05) return;

        // Initialize Audio Source
        playbackSourceNode = audioContext.createBufferSource();
        playbackSourceNode.buffer = audioBuffer;

        // Gain node for previewing volume boost
        const gainNode = audioContext.createGain();
        const boost = parseFloat(volumeBoost.value) || 1.0;
        gainNode.gain.value = boost;

        playbackSourceNode.connect(gainNode);
        gainNode.connect(audioContext.destination);

        const loop = loopCheckbox.checked;
        if (loop) {
            playbackSourceNode.loop = true;
            playbackSourceNode.loopStart = startVal;
            playbackSourceNode.loopEnd = endVal;
        }

        playbackOffset = startOffset;
        playbackStartTime = audioContext.currentTime;

        playbackSourceNode.start(0, startOffset, loop ? undefined : playLength);
        isPlaying = true;
        pausedPosition = null;

        playhead.classList.remove('hidden');
        playBtn.classList.add('hidden');
        pauseBtn.classList.remove('hidden');

        animatePlayhead(startOffset, startVal, endVal, endVal - startVal, loop);
    }

    function animatePlayhead(startOffset, startVal, endVal, loopDuration, loop) {
        const totalDuration = audioBuffer.duration;
        
        function update() {
            if (!isPlaying) return;

            const elapsed = audioContext.currentTime - playbackStartTime;
            let currentPos;

            if (loop) {
                const timeToFirstLoop = endVal - startOffset;
                if (elapsed < timeToFirstLoop) {
                    currentPos = startOffset + elapsed;
                } else {
                    const postFirstLoopElapsed = elapsed - timeToFirstLoop;
                    currentPos = startVal + (postFirstLoopElapsed % loopDuration);
                }
            } else {
                currentPos = startOffset + elapsed;
                if (currentPos >= endVal) {
                    stopPlayback(true);
                    return;
                }
            }

            const percent = (currentPos / totalDuration) * 100;
            playhead.style.left = `${percent}%`;

            playheadIntervalId = requestAnimationFrame(update);
        }

        playheadIntervalId = requestAnimationFrame(update);
    }

    function pausePlayback() {
        if (!isPlaying) return;

        const elapsed = audioContext.currentTime - playbackStartTime;
        const startVal = parseFloat(rangeStartSlider.value);
        const endVal = parseFloat(rangeEndSlider.value);
        const loopDuration = endVal - startVal;

        if (loopCheckbox.checked) {
            const timeToFirstLoop = endVal - playbackOffset;
            if (elapsed < timeToFirstLoop) {
                pausedPosition = playbackOffset + elapsed;
            } else {
                const postFirstLoopElapsed = elapsed - timeToFirstLoop;
                pausedPosition = startVal + (postFirstLoopElapsed % loopDuration);
            }
        } else {
            pausedPosition = playbackOffset + elapsed;
        }

        if (pausedPosition >= endVal) pausedPosition = startVal;

        stopPlayback(false); // Stop playing, keep paused position state

        // Keep playhead showing pause coordinate
        const totalDuration = audioBuffer.duration;
        const percent = (pausedPosition / totalDuration) * 100;
        playhead.classList.remove('hidden');
        playhead.style.left = `${percent}%`;
    }

    function stopPlayback(resetPausedState = true) {
        isPlaying = false;
        if (playheadIntervalId) {
            cancelAnimationFrame(playheadIntervalId);
            playheadIntervalId = null;
        }

        if (playbackSourceNode) {
            try {
                playbackSourceNode.stop();
            } catch (e) {}
            playbackSourceNode = null;
        }

        if (resetPausedState) {
            pausedPosition = null;
            playhead.classList.add('hidden');
            playhead.style.left = '0%';
        }

        playBtn.classList.remove('hidden');
        pauseBtn.classList.add('hidden');
    }

    // --- Compression & Optimization Logic ---
    convertBtn.addEventListener('click', optimizeAudio);

    async function optimizeAudio() {
        if (!audioBuffer) return;

        stopPlayback(true); // Stop any player node

        const preset = qualityPreset.value;
        const boostVal = parseFloat(volumeBoost.value) || 1.0;

        let targetSampleRate = 22050;
        let targetBitrate = 32;

        if (preset === 'ultra-low') {
            targetSampleRate = 16000;
            targetBitrate = 24;
        } else if (preset === 'high') {
            targetSampleRate = 44100;
            targetBitrate = 64;
        }

        // Configure loading screen
        editorSection.classList.add('hidden');
        statusIndicator.classList.remove('hidden');
        progressBarContainer.classList.remove('hidden');
        progressBarFill.style.width = '0%';
        statusMessage.textContent = 'Офлайн-ресемплювання та нормалізація...';

        try {
            const startVal = parseFloat(rangeStartSlider.value);
            const endVal = parseFloat(rangeEndSlider.value);
            const trimDuration = endVal - startVal;

            // 1. Offline Rendering: downmixes to mono, applies volume boost, and resamples to target
            const offlineCtx = new OfflineAudioContext(1, Math.round(targetSampleRate * trimDuration), targetSampleRate);
            
            const offlineSource = offlineCtx.createBufferSource();
            offlineSource.buffer = audioBuffer;

            const offlineGain = offlineCtx.createGain();
            offlineGain.gain.value = boostVal;

            offlineSource.connect(offlineGain);
            offlineGain.connect(offlineCtx.destination);

            offlineSource.start(0, startVal, trimDuration);

            // Run offline rendering
            const renderedBuffer = await offlineCtx.startRendering();

            statusMessage.textContent = 'Кодування в MP3 (стиснення для Anki)...';
            progressBarFill.style.width = '10%';

            // 2. Convert raw Float32 to Int16 PCM samples for Lamejs
            const channelData = renderedBuffer.getChannelData(0);
            const pcmData = new Int16Array(channelData.length);
            
            for (let i = 0; i < channelData.length; i++) {
                let s = channelData[i];
                // Clipping prevention
                if (s > 1.0) s = 1.0;
                else if (s < -1.0) s = -1.0;
                pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }

            // 3. Encode PCM to MP3 using lamejs in chunks asynchronously
            const mp3encoder = new lamejs.Mp3Encoder(1, targetSampleRate, targetBitrate);
            const mp3Data = [];
            const blockSize = 1152;
            let offset = 0;

            function encodeChunk() {
                if (offset >= pcmData.length) {
                    // Flush buffer
                    const flushBuf = mp3encoder.flush();
                    if (flushBuf.length > 0) mp3Data.push(flushBuf);
                    
                    finalizeOptimization(mp3Data);
                    return;
                }

                const chunk = pcmData.subarray(offset, offset + blockSize);
                const mp3buf = mp3encoder.encodeBuffer(chunk);
                if (mp3buf.length > 0) mp3Data.push(mp3buf);

                offset += blockSize;
                
                // Update progress
                const progress = 10 + Math.round((offset / pcmData.length) * 90);
                progressBarFill.style.width = `${progress}%`;

                // Give control back to browser to prevent UI lockup
                requestAnimationFrame(encodeChunk);
            }

            requestAnimationFrame(encodeChunk);

        } catch (err) {
            console.error('Optimization error:', err);
            alert('Помилка при оптимізації звуку: ' + err.message);
            statusIndicator.classList.add('hidden');
            editorSection.classList.remove('hidden');
        }
    }

    // Finalize MP3 creation and show Result Screen
    function finalizeOptimization(mp3Data) {
        const mp3Blob = new Blob(mp3Data, { type: 'audio/mp3' });
        const mp3Url = URL.createObjectURL(mp3Blob);

        // Update player source
        resultAudioPlayer.src = mp3Url;

        // Configure download button
        downloadResultBtn.href = mp3Url;
        
        let cleanName = originalFile.name.replace(/\.[^/.]+$/, ""); // Strip ext
        cleanName = cleanName.replace(/[^a-zA-Z0-9А-Яа-яЄєІіЇїҐґ_-]/g, "_"); // Sanitize filename
        downloadResultBtn.download = `${cleanName}_anki.mp3`;

        // Update statistics
        const origSizeKB = (originalFile.size / 1024).toFixed(1);
        const optSizeKB = (mp3Blob.size / 1024).toFixed(1);

        originalSizeVal.textContent = `${origSizeKB} KB`;
        optimizedSizeVal.textContent = `${optSizeKB} KB`;

        let savings = 0;
        if (originalFile.size > 0) {
            savings = Math.max(0, ((originalFile.size - mp3Blob.size) / originalFile.size) * 100).toFixed(0);
        }
        compressionRatioVal.textContent = `${savings}%`;

        statusIndicator.classList.add('hidden');
        resultSection.classList.remove('hidden');
    }

    // Back to editor from results
    backToEditorBtn.addEventListener('click', () => {
        resultSection.classList.add('hidden');
        editorSection.classList.remove('hidden');
        
        // Revoke result URL to prevent memory leaks
        if (resultAudioPlayer.src) {
            URL.revokeObjectURL(resultAudioPlayer.src);
            resultAudioPlayer.src = '';
        }
        
        // Re-draw waveform
        setTimeout(drawWaveform, 50);
    });

    // Clear and start over
    clearFileBtn.addEventListener('click', () => {
        stopPlayback(true);
        editorSection.classList.add('hidden');
        dropZone.classList.remove('hidden');
        fileInput.value = '';
        audioBuffer = null;
        originalFile = null;
    });

    // --- Helper Utilities ---
    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        
        const mStr = m < 10 ? '0' + m : m;
        const sStr = s < 10 ? '0' + s : s;
        const msStr = ms < 10 ? '0' + ms : ms;
        
        return `${mStr}:${sStr}.${msStr}`;
    }
});
