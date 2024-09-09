let timeMuted = 0;
let adsMuted = 0;

chrome.runtime.onInstalled.addListener(() => {
    console.log('Ad Muter extension installed');
    chrome.storage.sync.set({ adMuterEnabled: true, timeMuted: 0, adsMuted: 0 }, () => {
        console.log('Ad Muter enabled by default, metrics initialized');
    });
});

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
        timeMuted += request.muteDuration;
        adsMuted += 1;
        chrome.storage.sync.set({ timeMuted, adsMuted }, () => {
            console.log('Metrics updated:', { timeMuted, adsMuted });
        });
        sendResponse({ success: true });
        return true;
    } else if (request.action === 'getMetrics') {
        sendResponse({ timeMuted, adsMuted });
        return true;
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