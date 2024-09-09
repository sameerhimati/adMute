let enabled = true;

document.addEventListener('DOMContentLoaded', () => {
  const toggleButton = document.getElementById('toggleButton');
  const statusSpan = document.getElementById('status');

  // Load the saved state
  chrome.storage.sync.get(['adMuterEnabled'], (result) => {
    enabled = result.adMuterEnabled !== undefined ? result.adMuterEnabled : true;
    toggleButton.textContent = enabled ? 'Disable' : 'Enable';
    statusSpan.textContent = enabled ? 'Active' : 'Inactive';
  });

  toggleButton.addEventListener('click', () => {
    enabled = !enabled;
    toggleButton.textContent = enabled ? 'Disable' : 'Enable';
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
            statusSpan.textContent = 'Not available on this page';
          } else if (response && response.success) {
            console.log('Ad Muter toggled successfully');
          }
        });
      } else {
        console.log('No active tabs found.');
      }
    });
  });
});
