const app = document.getElementById('app');
const closeBtn = document.getElementById('close-btn');
const stationsList = document.getElementById('stations-list');
const playerBar = document.getElementById('player-bar');
const playPauseBtn = document.getElementById('play-pause-btn');
const volumeSlider = document.getElementById('volume-slider');
const radioAudio = document.getElementById('radio-audio');

const settingsBtn = document.getElementById('settings-btn');
const settingsDropdown = document.getElementById('settings-dropdown');
const toggleHud = document.getElementById('toggle-hud');
const toggleMute = document.getElementById('toggle-mute');
const searchInput = document.getElementById('station-search');

const npThumb = document.getElementById('np-thumb');
const npTitle = document.getElementById('np-title');
const npArtist = document.getElementById('np-artist');

const carAudio = document.getElementById('car-audio');
const outputSelect = document.getElementById('output-select');
const vehicleOption = document.getElementById('vehicle-option');
const carRadioHud = document.getElementById('car-radio-hud');
const hudThumb = document.getElementById('hud-thumb');
const hudStation = document.getElementById('hud-station');
const hudTitle = document.getElementById('hud-title');
const hudArtist = document.getElementById('hud-artist');

let activeStation = null;
let isPlaying = false;
let pollingInterval = null;
let carPollingInterval = null;

let currentCarStation = null;
const activeCarStreams = {};
let audioCtx = null;
let allStations = [];

let hideHud = false;
let globalMute = false;
let currentSearchQuery = "";

// --- Audio reliability helpers ---
const STREAM_RETRY_DELAYS = [2000, 4000, 8000, 15000, 30000]; // exponential backoff
const streamRetryCount = {};
const streamRetryTimers = {};
let mainAudioWatchdog = null;
let lastMainAudioTime = 0;

function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

/** Resume AudioContext if it was suspended by the browser (autoplay policy). */
function ensureAudioContextResumed() {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
        return ctx.resume();
    }
    return Promise.resolve();
}

// ---------- Main player watchdog ----------
function startMainAudioWatchdog() {
    stopMainAudioWatchdog();
    lastMainAudioTime = radioAudio.currentTime;
    mainAudioWatchdog = setInterval(() => {
        if (!isPlaying || outputSelect.value === 'vehicle') return;
        // If currentTime hasn't advanced in 5s the stream is stalled
        if (radioAudio.currentTime === lastMainAudioTime && !radioAudio.paused) {
            console.warn('[Radiocast] Main audio stall detected, reloading...');
            reloadMainAudio();
        }
        lastMainAudioTime = radioAudio.currentTime;
    }, 5000);
}

function stopMainAudioWatchdog() {
    if (mainAudioWatchdog) {
        clearInterval(mainAudioWatchdog);
        mainAudioWatchdog = null;
    }
}

function reloadMainAudio() {
    if (!activeStation) return;
    const vol = radioAudio.volume;
    radioAudio.pause();
    radioAudio.src = '';
    radioAudio.load();
    setTimeout(() => {
        radioAudio.src = activeStation.listen_url;
        radioAudio.volume = vol;
        radioAudio.muted = globalMute;
        ensureAudioContextResumed().then(() => {
            radioAudio.play().catch(() => {});
        });
    }, 500);
}

// ---------- 3D stream reliability ----------
function scheduleStreamRetry(netId, url, muffleFreq, finalVolume) {
    if (streamRetryTimers[netId]) return; // already scheduled
    const attempt = streamRetryCount[netId] || 0;
    const delay = STREAM_RETRY_DELAYS[Math.min(attempt, STREAM_RETRY_DELAYS.length - 1)];
    console.warn(`[Radiocast] 3D stream ${netId} failed, retry #${attempt + 1} in ${delay}ms`);
    streamRetryTimers[netId] = setTimeout(() => {
        delete streamRetryTimers[netId];
        // Only retry if the stream is still expected to be active
        if (!activeCarStreams[netId]) {
            createCarStream(netId, url, muffleFreq, finalVolume);
        }
        streamRetryCount[netId] = attempt + 1;
    }, delay);
}

function cancelStreamRetry(netId) {
    if (streamRetryTimers[netId]) {
        clearTimeout(streamRetryTimers[netId]);
        delete streamRetryTimers[netId];
    }
    delete streamRetryCount[netId];
}

function createCarStream(netId, url, muffleFreq, finalVolume) {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.muted = globalMute;
    audio.preload = 'none';

    const ctx = getAudioContext();
    const source = ctx.createMediaElementSource(audio);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = muffleFreq;
    const gainNode = ctx.createGain();
    gainNode.gain.value = finalVolume;
    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    activeCarStreams[netId] = { audio, filter, gainNode, url, source };

    audio.addEventListener('error', () => {
        if (activeCarStreams[netId]) {
            destroyCarStream(netId);
            scheduleStreamRetry(netId, url, muffleFreq, finalVolume);
        }
    });

    audio.src = url;
    ensureAudioContextResumed().then(() => {
        audio.play().catch(() => {
            if (activeCarStreams[netId]) {
                destroyCarStream(netId);
                scheduleStreamRetry(netId, url, muffleFreq, finalVolume);
            }
        });
    });
}

function destroyCarStream(netId) {
    const stream = activeCarStreams[netId];
    if (!stream) return;
    try {
        stream.audio.pause();
        stream.audio.src = '';
        stream.audio.load();
        stream.gainNode.disconnect();
        stream.filter.disconnect();
        if (stream.source) stream.source.disconnect();
    } catch(e) {}
    delete activeCarStreams[netId];
}

// NUI Message Listener
window.addEventListener('message', (event) => {
    const data = event.data;
    
    if (data.action === "open") {
        allStations = data.stations || [];
        getAudioContext().resume().catch(() => {});
        app.style.display = "flex";
        if (data.inVehicle) {
            outputSelect.style.display = "block";
            vehicleOption.innerText = data.vehicleName || "Vehicle";
            outputSelect.value = "vehicle";
            if (data.vehicleStation) {
                activeStation = data.vehicleStation;
                currentCarStation = data.vehicleStation;
                isPlaying = true;
                updatePlayPauseIcon();
                updateMetadata(data.vehicleStation.now_playing || null);
                playerBar.style.display = "flex";
                
                const vol = data.vehicleStation.sync_volume !== undefined ? data.vehicleStation.sync_volume : 0.5;
                volumeSlider.value = vol;
                const volIcon = document.querySelector('.volume-control i');
                if (vol == 0) {
                    volIcon.className = 'fa-solid fa-volume-xmark';
                } else if (vol < 0.5) {
                    volIcon.className = 'fa-solid fa-volume-low';
                } else {
                    volIcon.className = 'fa-solid fa-volume-high';
                }
            } else if (outputSelect.value === "vehicle") {
                activeStation = null;
                isPlaying = false;
                updatePlayPauseIcon();
                playerBar.style.display = "none";
            }
        } else {
            outputSelect.style.display = "none";
            outputSelect.value = "headphones";
        }
        searchInput.value = "";
        currentSearchQuery = "";
        renderStations(allStations);
    } else if (data.action === "show_car_hud") {
        currentCarStation = data.station;
        if (!hideHud) {
            carRadioHud.style.display = "flex";
        }
        hudStation.innerText = data.station.name;
        applyMarquee('hud-station');
        if (data.station.now_playing) {
            updateCarMetadata(data.station.now_playing);
        }
    } else if (data.action === "hide_car_hud") {
        currentCarStation = null;
        carRadioHud.style.display = "none";
    } else if (data.action === "sync_3d_audio") {
        const incomingIds = new Set();
        
        data.radios.forEach(radio => {
            incomingIds.add(radio.netId);
            
            const effectiveMaxDist = data.maxDist * (1.0 + radio.baseVolume);
            let distMult = 1.0 - (radio.dist / effectiveMaxDist);
            if (distMult < 0) distMult = 0;
            if (radio.dist === 0) distMult = 1.0;
            
            distMult = Math.pow(distMult, 1.5);
            
            let finalVolume = radio.baseVolume * distMult;
            let muffleFreq = 22000;
            
            if (radio.dist > 0) {
                if (radio.doorsOpen) {
                    finalVolume = finalVolume * 0.8;
                    muffleFreq = 22000;
                } else {
                    finalVolume = finalVolume * 0.45;
                    muffleFreq = 800 + (1000 * distMult);
                }
            }
            
            if (finalVolume > 1.0) finalVolume = 1.0;
            
            if (!activeCarStreams[radio.netId]) {
                cancelStreamRetry(radio.netId); // cancel any pending retry before creating fresh
                createCarStream(radio.netId, radio.url, muffleFreq, finalVolume);
            } else {
                const stream = activeCarStreams[radio.netId];
                if (stream.url !== radio.url) {
                    // URL changed — recreate entirely to avoid stale decode
                    destroyCarStream(radio.netId);
                    cancelStreamRetry(radio.netId);
                    createCarStream(radio.netId, radio.url, muffleFreq, finalVolume);
                } else {
                    // Resume if browser suspended it
                    if (stream.audio.paused && !stream.audio.ended) {
                        ensureAudioContextResumed().then(() => {
                            stream.audio.play().catch(() => {
                                destroyCarStream(radio.netId);
                                scheduleStreamRetry(radio.netId, radio.url, muffleFreq, finalVolume);
                            });
                        });
                    }
                    const ctx = getAudioContext();
                    stream.gainNode.gain.setTargetAtTime(finalVolume, ctx.currentTime, 0.1);
                    stream.filter.frequency.setTargetAtTime(muffleFreq, ctx.currentTime, 0.1);
                }
            }
            
            if (radio.dist === 0 && outputSelect.value === "vehicle") {
                if (document.activeElement !== volumeSlider) {
                    volumeSlider.value = radio.baseVolume;
                    const volIcon = document.querySelector('.volume-control i');
                    if (radio.baseVolume == 0) volIcon.className = 'fa-solid fa-volume-xmark';
                    else if (radio.baseVolume < 0.5) volIcon.className = 'fa-solid fa-volume-low';
                    else volIcon.className = 'fa-solid fa-volume-high';
                }
            }
        });
        
        Object.keys(activeCarStreams).forEach(netIdStr => {
            const netId = parseInt(netIdStr);
            if (!incomingIds.has(netId)) {
                destroyCarStream(netId);
                cancelStreamRetry(netId);
            }
        });
    } else if (data.action === "update_all_metadata") {
        const npData = data.data;
        npData.forEach(np => {
            const song = np.now_playing.song;
            const logoUrl = (song && song.art) ? song.art : 'https://ui-avatars.com/api/?name=Music&background=2a2a30&color=fff';
            
            const cardImg = document.getElementById(`station-img-${np.station.id}`);
            if (cardImg) {
                cardImg.src = logoUrl;
            }
            
            if (allStations && allStations.length > 0) {
                const s = allStations.find(x => x.id === np.station.id);
                if (s) s.now_playing = np.now_playing;
            }
            
            if (activeStation && activeStation.id === np.station.id) {
                activeStation.now_playing = np.now_playing;
                updateMetadata(np.now_playing);
            }
            
            if (currentCarStation && currentCarStation.id === np.station.id) {
                currentCarStation.now_playing = np.now_playing;
                updateCarMetadata(np.now_playing);
            }
        });
        
        if (currentSearchQuery !== "") {
            renderStations(allStations);
        }
    } else if (data.action === "update_restart_warning") {
        // ── Stop all audio ──────────────────────────────────────────────
        radioAudio.pause();
        stopMainAudioWatchdog();
        isPlaying = false;
        updatePlayPauseIcon();

        // Stop 3D car streams
        Object.keys(activeCarStreams).forEach(netIdStr => {
            destroyCarStream(parseInt(netIdStr));
            cancelStreamRetry(parseInt(netIdStr));
        });

        // ── Play restart notification sound ─────────────────────────────
        const notifAudio = document.getElementById('restart-notif-audio');
        if (notifAudio) {
            notifAudio.currentTime = 0;
            ensureAudioContextResumed().then(() => {
                notifAudio.play().catch(() => {});
            });
        }

        // ── Show update overlay in the main UI (if open) ─────────────────
        const updateOverlay = document.getElementById('update-overlay');
        if (updateOverlay) {
            updateOverlay.style.display = 'flex';
        }

        // ── Show update banner on the car HUD ────────────────────────────
        const hudBanner = document.getElementById('hud-update-banner');
        if (hudBanner) {
            hudBanner.style.display = 'flex';
            // Also make the HUD visible if it wasn't already
            if (carRadioHud.style.display === 'none') {
                carRadioHud.style.display = 'flex';
            }
            // Override station/title/artist text with restart message
            hudStation.innerText = 'RESTARTING FOR UPDATE';
            hudTitle.innerText = 'A new version is being applied...';
            hudArtist.innerText = '';
        }

        // ── Countdown ────────────────────────────────────────────────────
        const countdownEl = document.getElementById('update-countdown');
        let secondsLeft = 15;
        const tick = setInterval(() => {
            secondsLeft--;
            if (countdownEl) countdownEl.innerText = secondsLeft;
            if (secondsLeft <= 0) clearInterval(tick);
        }, 1000);
    }
});

// Close UI
closeBtn.addEventListener('click', () => {
    app.style.display = "none";
    settingsDropdown.style.display = "none";
    fetch(`https://${GetParentResourceName()}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    });
});

settingsBtn.addEventListener('click', () => {
    settingsDropdown.style.display = settingsDropdown.style.display === "none" ? "flex" : "none";
});

toggleHud.addEventListener('change', (e) => {
    hideHud = !e.target.checked;
    if (hideHud) {
        carRadioHud.style.display = "none";
    } else if (currentCarStation) {
        carRadioHud.style.display = "flex";
    }
});

toggleMute.addEventListener('change', (e) => {
    globalMute = e.target.checked;
    radioAudio.muted = globalMute;
    Object.values(activeCarStreams).forEach(stream => {
        stream.audio.muted = globalMute;
    });
});

searchInput.addEventListener('input', (e) => {
    currentSearchQuery = e.target.value.toLowerCase();
    renderStations(allStations);
});

// ESC key to close
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeBtn.click();
    }
});

function renderStations(stations) {
    stationsList.innerHTML = '';
    
    if (!stations || stations.length === 0) {
        stationsList.innerHTML = '<div style="color: #8a8a93; text-align: center; grid-column: 1/-1; padding: 40px;">No stations found. Ensure your server API key is configured correctly.</div>';
        return;
    }

    const filteredStations = stations.filter(station => {
        if (!currentSearchQuery) return true;
        
        const q = currentSearchQuery;
        if (station.name && station.name.toLowerCase().includes(q)) return true;
        if (station.description && station.description.toLowerCase().includes(q)) return true;
        
        if (station.now_playing && station.now_playing.song) {
            const song = station.now_playing.song;
            if (song.title && song.title.toLowerCase().includes(q)) return true;
            if (song.artist && song.artist.toLowerCase().includes(q)) return true;
        }
        
        return false;
    });

    if (filteredStations.length === 0) {
        stationsList.innerHTML = '<div style="color: #8a8a93; text-align: center; grid-column: 1/-1; padding: 40px;">No stations match your search.</div>';
        return;
    }

    filteredStations.forEach(station => {
        const card = document.createElement('div');
        card.className = 'station-card';
        if (activeStation && activeStation.id === station.id) {
            card.classList.add('active');
        }

        // Get logo or fallback
        const logoUrl = (station.now_playing && station.now_playing.song && station.now_playing.song.art) ? station.now_playing.song.art : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(station.name) + '&background=2a2a30&color=fff';

        card.innerHTML = `
            <img src="${logoUrl}" alt="${station.name}" class="station-logo" id="station-img-${station.id}" onerror="this.src='https://ui-avatars.com/api/?name=Radio&background=2a2a30&color=fff'">
            <div class="station-info">
                <div class="station-name">${station.name}</div>
                <div class="station-desc">${station.description || 'Live broadcast stream'}</div>
            </div>
        `;

        card.addEventListener('click', () => {
            document.querySelectorAll('.station-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            playStation(station);
        });

        stationsList.appendChild(card);
    });
}

function playStation(station) {
    activeStation = station;
    playerBar.style.display = "flex";
    
    if (outputSelect.value === "vehicle") {
        fetch(`https://${GetParentResourceName()}/setVehicleRadio`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ station: station })
        });
        isPlaying = true;
        updatePlayPauseIcon();
        updateMetadata(station.now_playing);
        return;
    }

    // Set audio source and play
    stopMainAudioWatchdog();
    radioAudio.src = '';
    radioAudio.load();
    radioAudio.src = station.listen_url;
    radioAudio.volume = parseFloat(volumeSlider.value);
    radioAudio.muted = globalMute;

    ensureAudioContextResumed().then(() => {
        radioAudio.play().then(() => {
            isPlaying = true;
            updatePlayPauseIcon();
            notifyMusicStarted();
            startMainAudioWatchdog();
        }).catch(err => {
            console.error('[Radiocast] Audio playback failed:', err);
            isPlaying = false;
            updatePlayPauseIcon();
        });
    });

    // Set initial metadata if available
    updateMetadata(station.now_playing);
}

function updateMetadata(nowPlaying) {
    if (!nowPlaying || !nowPlaying.song) return;
    
    const song = nowPlaying.song;
    npTitle.innerText = song.title || 'Unknown Title';
    npArtist.innerText = song.artist || 'Unknown Artist';
    
    if (song.art) {
        npThumb.style.backgroundImage = `url('${song.art}')`;
    } else {
        npThumb.style.backgroundImage = `url('https://ui-avatars.com/api/?name=Music&background=2a2a30&color=fff')`;
    }
}

playPauseBtn.addEventListener('click', () => {
    if (!activeStation) return;
    
    if (outputSelect.value === "vehicle") {
        if (isPlaying) {
            fetch(`https://${GetParentResourceName()}/setVehicleRadio`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ station: null })
            });
            isPlaying = false;
        } else {
            fetch(`https://${GetParentResourceName()}/setVehicleRadio`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ station: activeStation })
            });
            isPlaying = true;
        }
        updatePlayPauseIcon();
        return;
    }

    if (isPlaying) {
        radioAudio.pause();
        stopMainAudioWatchdog();
        isPlaying = false;
    } else {
        ensureAudioContextResumed().then(() => {
            radioAudio.play().then(() => {
                isPlaying = true;
                updatePlayPauseIcon();
                notifyMusicStarted();
                startMainAudioWatchdog();
            }).catch(() => {
                // Stream may be dead — reload it
                reloadMainAudio();
                isPlaying = true;
                updatePlayPauseIcon();
                notifyMusicStarted();
            });
        });
        return; // updatePlayPauseIcon called inside promise
    }
    updatePlayPauseIcon();
});

function updatePlayPauseIcon() {
    if (isPlaying) {
        playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
    } else {
        playPauseBtn.innerHTML = '<i class="fa-solid fa-play" style="margin-left: 2px;"></i>';
    }
}

outputSelect.addEventListener('change', (e) => {
    // If switching to vehicle, we rely on the 3D sync to update the slider if we are in one.
    if (e.target.value === "headphones") {
        volumeSlider.value = radioAudio.volume;
        const volIcon = document.querySelector('.volume-control i');
        if (radioAudio.volume == 0) volIcon.className = 'fa-solid fa-volume-xmark';
        else if (radioAudio.volume < 0.5) volIcon.className = 'fa-solid fa-volume-low';
        else volIcon.className = 'fa-solid fa-volume-high';
    }
});

volumeSlider.addEventListener('input', (e) => {
    const vol = parseFloat(e.target.value);
    
    if (outputSelect.value !== "vehicle") {
        radioAudio.volume = vol;
    }
    
    // Update icon dynamically based on volume
    const volIcon = document.querySelector('.volume-control i');
    if (vol == 0) {
        volIcon.className = 'fa-solid fa-volume-xmark';
    } else if (vol < 0.5) {
        volIcon.className = 'fa-solid fa-volume-low';
    } else {
        volIcon.className = 'fa-solid fa-volume-high';
    }
});

volumeSlider.addEventListener('change', (e) => {
    const vol = parseFloat(e.target.value);
    
    if (outputSelect.value === "vehicle") {
        fetch(`https://${GetParentResourceName()}/setVehicleVolume`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ volume: vol })
        }).catch(err => {});
    }
});

function notifyMusicStarted() {
    fetch(`https://${GetParentResourceName()}/musicStarted`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    }).catch(e => {});
}

function applyMarquee(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const parent = el.parentElement;
    
    el.style.animation = 'none';
    el.style.transform = 'translateX(0)';
    
    setTimeout(() => {
        if (el.scrollWidth > parent.clientWidth) {
            const distance = el.scrollWidth - parent.clientWidth;
            el.style.setProperty('--scroll-dist', `-${distance}px`);
            const duration = Math.max(3, distance / 30);
            el.style.animation = `scrollText ${duration}s linear infinite alternate`;
        }
    }, 50);
}

function updateCarMetadata(nowPlaying) {
    if (!nowPlaying || !nowPlaying.song) return;
    const song = nowPlaying.song;
    hudTitle.innerText = song.title || 'Unknown Title';
    hudArtist.innerText = song.artist || 'Unknown Artist';
    
    applyMarquee('hud-title');
    applyMarquee('hud-artist');
    
    if (song.art) {
        hudThumb.style.backgroundImage = `url('${song.art}')`;
    } else {
        hudThumb.style.backgroundImage = `url('https://ui-avatars.com/api/?name=Music&background=2a2a30&color=fff')`;
    }
}
