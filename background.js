chrome.runtime.onInstalled.addListener(() => {
    console.log('Ad Muter extension installed');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'muteTab') {
        if (sender.tab) {
            chrome.tabs.update(sender.tab.id, { muted: true }, () => {
                if (chrome.runtime.lastError) {
                    console.log('Error muting tab:', chrome.runtime.lastError.message);
                } else {
                    console.log('Tab muted successfully');
                }
                sendResponse({ success: true });
            });
        } else {
            console.log('Sender tab not available for mute action.');
            sendResponse({ success: false });
        }
        return true; // Indicates that the response is sent asynchronously
    } else if (request.action === 'unmuteTab') {
        if (sender.tab) {
            chrome.tabs.update(sender.tab.id, { muted: false }, () => {
                if (chrome.runtime.lastError) {
                    console.log('Error unmuting tab:', chrome.runtime.lastError.message);
                } else {
                    console.log('Tab unmuted successfully');
                }
                sendResponse({ success: true });
            });
        } else {
            console.log('Sender tab not available for unmute action.');
            sendResponse({ success: false });
        }
        return true; // Indicates that the response is sent asynchronously
    } else if (request.action === 'ping') {
        sendResponse({ success: true });
    }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('youtube.com')) {
        chrome.tabs.sendMessage(tabId, { action: 'checkForAds' });
    }
});

