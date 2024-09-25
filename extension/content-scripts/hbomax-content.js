let adObserver = null;
let isEnabled = true;
let isMuted = false;
let isAdPlaying = false;
let adStartTime = 0;
let consecutiveAdChecks = 0;
const AD_CHECK_THRESHOLD = 3;

chrome.storage.sync.get(['adMuterEnabled'], (result) => {
    isEnabled = result.adMuterEnabled !== undefined ? result.adMuterEnabled : true;
    if (isEnabled) {
        initAdDetection();
    }
});

function checkForHBOMaxAds() {
    if (!isEnabled) return;

    try {
        const adDetected = checkVisualAdMarkers() || 
                           checkPlayerStateChanges() || 
                           checkAudioLevels();

        if (adDetected) {
            consecutiveAdChecks++;
            if (consecutiveAdChecks >= AD_CHECK_THRESHOLD && !isAdPlaying) {
                isAdPlaying = true;
                adStartTime = Date.now();
                handleAdStart();
            }
        } else {
            if (consecutiveAdChecks >= AD_CHECK_THRESHOLD && isAdPlaying) {
                isAdPlaying = false;
                handleAdEnd();
            }
            consecutiveAdChecks = 0;
        }

        console.log('HBO Max ad check:', { adDetected, consecutiveAdChecks, isAdPlaying });
    } catch (error) {
        console.log('Error checking for HBO Max ads:', error);
        handleExtensionError(error);
    }
}

function checkVisualAdMarkers() {
    const adMarkers = [
        '.ad-container', '.ad-overlay', '.ad-banner',
        '[data-testid="ad-overlay"]', '[data-testid="ad-banner"]'
    ];
    return adMarkers.some(marker => document.querySelector(marker));
}

function checkPlayerStateChanges() {
    // Implement HBO Max-specific player state checks
    return false;
}

function checkAudioLevels() {
    // Implement HBO Max-specific audio level checks
    return false;
}

function handleAdStart() {
    console.log('HBO Max ad detected, attempting to mute tab');
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
            console.log('Error sending mute message:', error);
            handleExtensionError(error);
        });
}

function handleAdEnd() {
    console.log('HBO Max ad ended, attempting to unmute tab');
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
            console.log('Error sending unmute message:', error);
            handleExtensionError(error);
        });
}

function updateMetrics() {
    const muteDuration = Math.round((Date.now() - adStartTime) / 1000);
    chrome.runtime.sendMessage({
        action: 'updateMetrics',
        muteDuration: muteDuration
    });
}

function handleExtensionError(error) {
    console.log('Handling extension error:', error);
    if (error.message.includes('Extension context invalidated')) {
        console.log('Extension context invalidated. Reloading ad detection.');
        stopAdDetection();
        setTimeout(() => {
            initAdDetection();
        }, 1000);
    } else if (error.message.includes('Permission denied')) {
        console.log('Permission denied error. This may affect some functionality.');
    }
}

function initAdDetection() {
    if (adObserver) {
        adObserver.disconnect();
    }
    adObserver = new MutationObserver(() => {
        checkForHBOMaxAds();
    });
    const config = { childList: true, subtree: true, attributes: true, characterData: true };

    function observePlayer() {
        const playerContainer = document.querySelector('.video-player') || document.body;
        adObserver.observe(playerContainer, config);
        console.log('Observing HBO Max player container');
        checkForHBOMaxAds(); // Initial check
        console.log('HBO Max ad detection initialized');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observePlayer);
    } else {
        observePlayer();
    }

    // Set up periodic checks
    setInterval(checkForHBOMaxAds, 1000);
}

function stopAdDetection() {
    if (adObserver) {
        adObserver.disconnect();
        adObserver = null;
    }
    console.log('HBO Max ad detection stopped');
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggleAdMuter') {
        isEnabled = request.enabled;
        console.log('Ad Muter toggled on HBO Max:', isEnabled);
        if (isEnabled) {
            initAdDetection();
        } else {
            stopAdDetection();
        }
        sendResponse({ success: true });
    }
    return true;
});

initAdDetection();

console.log('HBO Max content script loaded');