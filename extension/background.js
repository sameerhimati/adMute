let userId;
const SERVER_URL = 'http://localhost:5000'; // Change this to your actual server URL when deployed

chrome.runtime.onInstalled.addListener(() => {
    console.log('Ad Muter extension installed');
    userId = generateUserId();
    chrome.storage.sync.set({ adMuterEnabled: true, userId: userId }, () => {
        console.log('Ad Muter enabled by default, user ID set');
    });
    initializeMetrics();
    scheduleDataSync();
});

function generateUserId() {
    return 'user_' + Math.random().toString(36).substr(2, 9);
}

function initializeMetrics() {
    chrome.storage.sync.get(['timeMuted', 'adsMuted'], (result) => {
        if (result.timeMuted === undefined || result.adsMuted === undefined) {
            chrome.storage.sync.set({ timeMuted: 0, adsMuted: 0 }, () => {
                console.log('Metrics initialized');
            });
        }
    });
}

function scheduleDataSync() {
    setInterval(sendDataToServer, 15 * 60 * 1000); // Send data every 15 minutes
}

function sendDataToServer() {
    chrome.storage.sync.get(['userId', 'timeMuted', 'adsMuted'], (data) => {
        fetch(`${SERVER_URL}/api/data`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                user_id: data.userId,
                ads_muted: data.adsMuted,
                total_mute_duration: data.timeMuted,
            }),
        })
        .then(response => response.json())
        .then(result => console.log('Data sent successfully:', result))
        .catch(error => console.error('Error sending data:', error));
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'muteTab') {
        if (sender.tab) {
            chrome.tabs.update(sender.tab.id, { muted: true })
                .then(() => {
                    console.log('Tab muted successfully');
                    sendResponse({ success: true });
                })
                .catch((error) => {
                    console.log('Error muting tab:', error);
                    sendResponse({ success: false, error: error.message });
                });
        } else {
            console.log('Sender tab not available for mute action.');
            sendResponse({ success: false, error: 'Sender tab not available' });
        }
        return true; // Indicates that the response is sent asynchronously
    } else if (request.action === 'unmuteTab') {
        if (sender.tab) {
            chrome.tabs.update(sender.tab.id, { muted: false })
                .then(() => {
                    console.log('Tab unmuted successfully');
                    sendResponse({ success: true });
                })
                .catch((error) => {
                    console.log('Error unmuting tab:', error);
                    sendResponse({ success: false, error: error.message });
                });
        } else {
            console.log('Sender tab not available for unmute action.');
            sendResponse({ success: false, error: 'Sender tab not available' });
        }
        return true; // Indicates that the response is sent asynchronously
    } else if (request.action === 'updateMetrics') {
        chrome.storage.sync.get(['timeMuted', 'adsMuted'], (result) => {
            const newTimeMuted = (result.timeMuted || 0) + request.muteDuration;
            const newAdsMuted = (result.adsMuted || 0) + 1;
            chrome.storage.sync.set({ timeMuted: newTimeMuted, adsMuted: newAdsMuted }, () => {
                console.log('Metrics updated:', { timeMuted: newTimeMuted, adsMuted: newAdsMuted });
                sendResponse({ success: true });
            });
        });
        return true; // Indicates that the response is sent asynchronously
    } else if (request.action === 'getMetrics') {
        chrome.storage.sync.get(['timeMuted', 'adsMuted'], (result) => {
            sendResponse({ timeMuted: result.timeMuted || 0, adsMuted: result.adsMuted || 0 });
        });
        return true; // Indicates that the response is sent asynchronously
    } else if (request.action === 'sendFeedback') {
        chrome.storage.sync.get(['userId'], (data) => {
            fetch(`${SERVER_URL}/api/data`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_id: data.userId,
                    feedback: request.feedback,
                }),
            })
            .then(response => response.json())
            .then(result => {
                console.log('Feedback sent successfully:', result);
                sendResponse({success: true});
            })
            .catch(error => {
                console.error('Error sending feedback:', error);
                sendResponse({success: false, error: error.message});
            });
        });
        return true; // Indicates that the response is sent asynchronously
    }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('youtube.com')) {
        chrome.tabs.sendMessage(tabId, { action: 'checkForAds' })
            .then(() => console.log('Sent checkForAds message to tab'))
            .catch(error => console.log('Error sending message to tab:', error));
    }
});

console.log('Background script loaded');