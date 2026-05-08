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

function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
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
                const audio = new Audio(radio.url);
                audio.crossOrigin = "anonymous";
                audio.muted = globalMute;
                
                const ctx = getAudioContext();
                const source = ctx.createMediaElementSource(audio);
                const filter = ctx.createBiquadFilter();
                filter.type = "lowpass";
                filter.frequency.value = muffleFreq;
                
                const gainNode = ctx.createGain();
                gainNode.gain.value = finalVolume;
                
                source.connect(filter);
                filter.connect(gainNode);
                gainNode.connect(ctx.destination);
                
                audio.play().catch(e => {});
                activeCarStreams[radio.netId] = {
                    audio: audio,
                    filter: filter,
                    gainNode: gainNode,
                    url: radio.url
                };
            } else {
                const stream = activeCarStreams[radio.netId];
                if (stream.url !== radio.url) {
                    stream.audio.src = radio.url;
                    stream.url = radio.url;
                    stream.audio.play().catch(e => {});
                }
                const ctx = getAudioContext();
                stream.gainNode.gain.setTargetAtTime(finalVolume, ctx.currentTime, 0.1);
                stream.filter.frequency.setTargetAtTime(muffleFreq, ctx.currentTime, 0.1);
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
                const stream = activeCarStreams[netId];
                stream.audio.pause();
                stream.audio.removeAttribute('src');
                stream.gainNode.disconnect();
                stream.filter.disconnect();
                delete activeCarStreams[netId];
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
    radioAudio.src = station.listen_url;
    radioAudio.volume = volumeSlider.value;
    radioAudio.play().then(() => {
        isPlaying = true;
        updatePlayPauseIcon();
        notifyMusicStarted();
    }).catch(err => {
        console.error("Audio playback failed:", err);
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
        isPlaying = false;
    } else {
        radioAudio.play();
        isPlaying = true;
        notifyMusicStarted();
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
