let adObserver = null;
let isAdMuterEnabled = false;
let isMuted = false;
let isAdPlaying = false;
let adStartTime = 0;
let adDuration = 0;
const AD_CHECK_INTERVAL = 500;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateAdMuterState') {
        isAdMuterEnabled = request.enabled;
        if (isAdMuterEnabled) {
            initAdDetection();
        } else {
            stopAdDetection();
        }
        sendResponse({ success: true });
    } else if (request.action === 'initializeAdDetection') {
        chrome.storage.sync.get(['adMuterEnabled'], (result) => {
            isAdMuterEnabled = result.adMuterEnabled;
            if (isAdMuterEnabled) {
                initAdDetection();
            }
            sendResponse({ success: true });
        });
    }
    return true;
});

function checkForPeacockAds() {
    if (!isAdMuterEnabled) return;

    const adCountdown = document.querySelector('.countdown__foreground-ring');
    const adCountdownContainer = document.querySelector('.countdown-container.ad-countdown__container');

    if (adCountdown && adCountdownContainer) {
        if (!isAdPlaying) {
            isAdPlaying = true;
            adStartTime = Date.now();
            handleAdStart();
        }

        // Try to get ad duration
        const remainingTimeElement = adCountdownContainer.querySelector('.countdown__remaining-time');
        if (remainingTimeElement) {
            const remainingTime = parseInt(remainingTimeElement.textContent);
            if (!isNaN(remainingTime)) {
                adDuration = remainingTime;
                console.log(`Ad duration detected: ${adDuration} seconds`);
            }
        }
    } else if (isAdPlaying) {
        isAdPlaying = false;
        handleAdEnd();
    }
}

function handleAdStart() {
    console.log('Peacock ad detected, attempting to mute tab');
    chrome.runtime.sendMessage({ action: 'muteTab' })
        .then(response => {
            if (response && response.success) {
                console.log('Tab muted successfully');
                isMuted = true;
            } else {
                console.log('Failed to mute tab:', response ? response.error : 'Unknown error');
            }
        })
        .catch(error => {
            console.error('Error sending mute message:', error);
        });
}

function handleAdEnd() {
    console.log('Peacock ad ended, attempting to unmute tab');
    chrome.runtime.sendMessage({ action: 'unmuteTab' })
        .then(response => {
            if (response && response.success) {
                console.log('Tab unmuted successfully');
                isMuted = false;
                updateMetrics();
            } else {
                console.log('Failed to unmute tab:', response ? response.error : 'Unknown error');
            }
        })
        .catch(error => {
            console.error('Error sending unmute message:', error);
        });
}

function updateMetrics() {
    const muteDuration = Math.round((Date.now() - adStartTime) / 1000);
    chrome.runtime.sendMessage({
        action: 'updateMetrics',
        muteDuration: muteDuration
    });
}

function initAdDetection() {
    if (adObserver) {
        adObserver.disconnect();
    }
    adObserver = new MutationObserver(checkForPeacockAds);
    const config = { childList: true, subtree: true, attributes: true };

    adObserver.observe(document.documentElement, config);
    console.log('Peacock ad detection initialized');

    // Set up periodic checks
    setInterval(checkForPeacockAds, AD_CHECK_INTERVAL);
}

function stopAdDetection() {
    if (adObserver) {
        adObserver.disconnect();
        adObserver = null;
    }
    console.log('Peacock ad detection stopped');
}

// Initialize on load
chrome.storage.sync.get(['adMuterEnabled'], (result) => {
    isAdMuterEnabled = result.adMuterEnabled === true;
    if (isAdMuterEnabled) {
        initAdDetection();
    }
});

console.log('Peacock content script loaded');