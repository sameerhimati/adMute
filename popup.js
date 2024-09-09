let enabled = true;

document.addEventListener('DOMContentLoaded', () => {
    const toggleButton = document.getElementById('adMuterToggle');
    const statusSpan = document.getElementById('statusText');
    const feedbackBtn = document.getElementById('feedbackBtn');
    const feedbackForm = document.getElementById('feedbackForm');
    const submitFeedback = document.getElementById('submitFeedback');

    // Load the saved state
    chrome.storage.sync.get(['adMuterEnabled'], (result) => {
        enabled = result.adMuterEnabled !== undefined ? result.adMuterEnabled : true;
        toggleButton.checked = enabled;
        statusSpan.textContent = enabled ? 'Active' : 'Inactive';
        updateMetrics();
    });

    toggleButton.addEventListener('change', () => {
        enabled = toggleButton.checked;
        statusSpan.textContent = enabled ? 'Active' : 'Inactive';

        // Save the state
        chrome.storage.sync.set({ adMuterEnabled: enabled }, () => {
            console.log('Ad Muter state saved:', enabled);
        });

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleAdMuter', enabled }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.log('Error:', chrome.runtime.lastError.message);
                    } else if (response && response.success) {
                        console.log('Ad Muter toggled successfully');
                        updateMetrics();
                    }
                });
            } else {
                console.log('No active tabs found.');
            }
        });
    });

    feedbackBtn.addEventListener('click', () => {
        feedbackForm.classList.toggle('hidden');
    });

    submitFeedback.addEventListener('click', () => {
        const feedbackText = document.getElementById('feedbackText').value;
        if (feedbackText.trim() !== '') {
            // Send feedback to your server or email
            console.log('Feedback submitted:', feedbackText);
            // You can implement the actual submission logic here
            feedbackForm.classList.add('hidden');
            document.getElementById('feedbackText').value = '';
            alert('Thank you for your feedback!');
        }
    });

    updateMetrics();
});

function updateMetrics() {
    chrome.storage.sync.get(['timeMuted', 'adsMuted'], (result) => {
        const timeMuted = result.timeMuted || 0;
        const adsMuted = result.adsMuted || 0;
        
        document.getElementById('timeMuted').textContent = formatTime(timeMuted);
        document.getElementById('adsMuted').textContent = adsMuted;
        document.getElementById('timeSaved').textContent = formatTime(timeMuted * 0.8); // Assuming 80% of muted time is saved
    });
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
}