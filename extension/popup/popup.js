import { encrypt, decrypt } from '../utils/crypto-utils.js';
import { 
    getUserInfo, 
    getSubscriptionStatus, 
    login, 
    register, 
    refreshToken,
    getDevices,
    registerDevice,
    createCheckoutSession,
    updateUserMetrics,
    getUserMetrics
} from '../api.js';

// Event Listeners
document.addEventListener('DOMContentLoaded', initializePopup);
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'subscriptionUpdated') {
        updateUI();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('adMuterToggle');
    
    chrome.runtime.sendMessage({ action: 'getAdMuterState' }, (response) => {
      toggle.checked = response.enabled;
    });
    
    toggle.addEventListener('change', (event) => {
      chrome.runtime.sendMessage({ action: 'setAdMuterState', enabled: event.target.checked });
    });
  });

// Initialization
async function initializePopup() {
    setupEventListeners();
    try {
        const isAuthenticated = await checkAuthStatus();
        if (isAuthenticated) {
            await checkSubscriptionStatus();
            initializeAdMuter();
            updateUI();
        } else {
            console.log('User not authenticated, showing login view');
            showView('loginView');
        }
    } catch (error) {
        console.error('Error initializing popup:', error);
        showView('loginView');
        showError('Please log in to use the extension.');
    }
}

function setupEventListeners() {
    document.getElementById('showRegister').addEventListener('click', () => showView('registerView'));
    document.getElementById('showLogin').addEventListener('click', () => showView('loginView'));
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    document.getElementById('logoutButton').addEventListener('click', handleLogout);
    document.getElementById('adMuterToggle').addEventListener('change', handleToggle);
    document.getElementById('subscribeBtn').addEventListener('click', showSubscriptionOptions);
    document.querySelectorAll('.plan-option').forEach(option => {
        option.addEventListener('click', handlePlanSelection);
    });
}

// Authentication
async function checkAuthStatus() {
    try {
        console.log('Checking auth status...');
        const token = await getAccessToken();
        if (!token) {
            console.log('No valid token found, showing login view');
            showView('loginView');
            return false;
        }
        console.log('Token found, fetching user info...');
        const userData = await getUserInfo();
        console.log('User info received:', userData);
        showUserInfo(userData);
        await onSuccessfulLogin();
        return true;
    } catch (error) {
        console.error('Error checking auth status:', error);
        showView('loginView');
        return false;
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const data = await login(username, password);
        await storeTokens(data.access_token, data.refresh_token);
        await onSuccessfulLogin();
        showUserInfo({ username });
    } catch (error) {
        console.error('Login error:', error);
        if (error.message.includes('User not found')) {
            showError('No account found with this username. Please check your credentials or register a new account.');
        } else if (error.message.includes('Incorrect password')) {
            showError('Incorrect password. Please try again.');
        } else {
            showError('An error occurred during login. Please try again later.');
        }
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    
    try {
        const data = await register(username, email, password);
        await storeTokens(data.access_token, data.refresh_token);
        await onSuccessfulLogin();
        showUserInfo({ username });
    } catch (error) {
        console.error('Registration error:', error);
        if (error.message.includes('Username or email already exists')) {
            showError('This username or email is already registered. Please choose a different one or log in.');
        } else {
            showError('An error occurred during registration. Please try again later.');
        }
    }
}

async function handleLogout() {
    try {
        await chrome.runtime.sendMessage({ action: 'logout' });
        clearUserData();
        showView('loginView');
    } catch (error) {
        console.error('Error during logout:', error);
        showError('An error occurred during logout. Please try again.');
    }
}

async function onSuccessfulLogin() {
    try {
        console.log('Fetching subscription status after login...');
        const subscriptionData = await getSubscriptionStatus();
        console.log('Subscription data received:', subscriptionData);
        
        if (subscriptionData.status === 'inactive') {
            console.log('No active subscription');
            chrome.storage.sync.set({ subscriptionStatus: 'inactive' }, () => {
                updateSubscriptionUI({ status: 'inactive' });
                updateToggleUI();
            });
        } else {
            console.log('Active subscription found');
            chrome.storage.sync.set({ 
                subscriptionStatus: 'active',
                subscriptionPlan: subscriptionData.plan,
                deviceLimit: subscriptionData.device_limit,
                subscriptionEnd: subscriptionData.current_period_end
            }, () => {
                updateSubscriptionUI(subscriptionData);
                updateToggleUI();
            });
        }
        
        updateMetrics();
        
        if (subscriptionData.status === 'active') {
            console.log('Fetching devices...');
            await fetchDevices();
            const deviceId = await getDeviceId();
            try {
                await registerDevice(deviceId, navigator.platform);
                console.log('Device registration successful');
            } catch (error) {
                console.log('Device registration failed, but continuing: ', error);
            }
        } else {
            console.log('Login successful, but no active subscription');
        }
    } catch (error) {
        console.error('Error during login process:', error);
        showError(`An error occurred: ${error.message}. Please try again.`);
    }
}

async function checkSubscriptionStatus() {
    try {
        const subscriptionData = await getSubscriptionStatus();
        if (!subscriptionData) {
            throw new Error('Invalid response from subscription status endpoint');
        }
        chrome.storage.sync.set({ 
            subscriptionStatus: subscriptionData.status,
            subscriptionPlan: subscriptionData.plan,
            deviceLimit: subscriptionData.device_limit,
            subscriptionEnd: subscriptionData.current_period_end
        }, () => {
            console.log('Popup: Subscription status updated:', subscriptionData.status);
            updateUI();
        });
        return subscriptionData.status === 'active';
    } catch (error) {
        console.error('Popup: Error checking subscription status:', error);
        if (error.message === 'No access token available' || error.message === 'Failed to refresh token') {
            // User is not logged in or token refresh failed
            showView('loginView');
            showError('Please log in to check your subscription status.');
        } else {
            showError('Failed to fetch subscription status. Please try again.');
        }
        return false;
    }
}

// Subscription
function showSubscriptionOptions() {
    document.getElementById('subscriptionOptions').classList.remove('hidden');
}

async function handlePlanSelection(event) {
    const selectedPlan = event.currentTarget.dataset.plan;
    if (!selectedPlan) {
        console.error('No plan selected');
        return;
    }

    try {
        const { url } = await createCheckoutSession(selectedPlan);
        const checkoutWindow = window.open(url, '_blank');
        
        // Set up an interval to check the subscription status
        const checkSubscriptionStatus = setInterval(async () => {
            if (checkoutWindow.closed) {
                clearInterval(checkSubscriptionStatus);
                await verifyAndUpdateSubscription();
            }
        }, 1000); // Check every second

    } catch (error) {
        console.error('Error creating checkout session:', error);
        showError('Failed to start subscription process. Please try again.');
    }
}

async function verifyAndUpdateSubscription() {
    try {
        const subscriptionData = await getSubscriptionStatus();
        chrome.storage.sync.get(['adMuterEnabled'], (result) => {
            chrome.storage.sync.set({ 
                subscriptionStatus: subscriptionData.status,
                subscriptionPlan: subscriptionData.plan,
                deviceLimit: subscriptionData.device_limit,
                subscriptionEnd: subscriptionData.current_period_end,
                adMuterEnabled: subscriptionData.status === 'active' ? (result.adMuterEnabled !== undefined ? result.adMuterEnabled : true) : false
            }, () => {
                console.log('Subscription status updated:', subscriptionData.status);
                updateUI();
                if (subscriptionData.status === 'active') {
                    showMessage('Subscription activated successfully!');
                } else {
                    showMessage('Subscription process incomplete. Please try again or contact support.');
                }
            });
        });
    } catch (error) {
        console.error('Error verifying subscription:', error);
        showError('Failed to verify subscription. Please check your account or contact support.');
    }
}

// UI Updates
function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}

function showUserInfo(userData) {
    document.getElementById('username').textContent = userData.username;
    showView('userView');
}

function updateUI() {
    updateSubscriptionUI();
    updateToggleUI();
    updateMetrics();
}

function updateSubscriptionUI() {
    chrome.storage.sync.get(['subscriptionStatus', 'subscriptionPlan', 'deviceLimit', 'subscriptionEnd'], (result) => {
        const subscriptionInfo = document.getElementById('subscriptionInfo');
        const subscribeBtn = document.getElementById('subscribeBtn');
        
        console.log('Updating subscription UI with:', result);

        if (result.subscriptionStatus === 'active') {
            subscriptionInfo.innerHTML = `
                <p>Plan: ${result.subscriptionPlan}</p>
                <p>Status: Active</p>
                <p>Device Limit: ${result.deviceLimit}</p>
                <p>Renewal Date: ${new Date(result.subscriptionEnd).toLocaleDateString()}</p>
            `;
            subscribeBtn.classList.add('hidden');
        } else {
            subscriptionInfo.innerHTML = `<p>No active subscription</p>`;
            subscribeBtn.classList.remove('hidden');
        }
    });
}

function updateToggleUI() {
    chrome.storage.sync.get(['adMuterEnabled', 'subscriptionStatus'], (result) => {
        const adMuterToggle = document.getElementById('adMuterToggle');
        const statusText = document.getElementById('statusText');
        const statusIndicator = document.getElementById('statusIndicator');
        
        console.log('UpdateToggleUI - Subscription status:', result.subscriptionStatus);
        console.log('UpdateToggleUI - AdMuter enabled:', result.adMuterEnabled);
        
        if (result.subscriptionStatus === 'active') {
            adMuterToggle.disabled = false;
            adMuterToggle.checked = result.adMuterEnabled !== undefined ? result.adMuterEnabled : true;
            statusText.textContent = adMuterToggle.checked ? 'Active' : 'Inactive';
            statusIndicator.style.backgroundColor = adMuterToggle.checked ? '#4CAF50' : '#F44336';
        } else {
            adMuterToggle.disabled = true;
            adMuterToggle.checked = false;
            statusText.textContent = 'Subscription Required';
            statusIndicator.style.backgroundColor = '#F44336';
        }
    });
}

async function updateMetrics() {
    try {
        const metrics = await getUserMetrics();
        chrome.storage.sync.set({ 
            timeMuted: metrics.total_muted_time, 
            adsMuted: metrics.total_ads_muted 
        }, () => {
            document.getElementById('timeMuted').textContent = formatTime(metrics.total_muted_time);
            document.getElementById('adsMuted').textContent = metrics.total_ads_muted;
            document.getElementById('timeSaved').textContent = formatTime(Math.round(metrics.total_muted_time * 0.8));
        });
    } catch (error) {
        console.error('Error fetching user metrics:', error);
        showError('Failed to fetch user metrics. Please try again.');
    }
}

function updateDevicesUI(data) {
    const deviceList = document.getElementById('deviceList');
    const deviceCount = document.getElementById('deviceCount');
    if (deviceList) {
        deviceList.innerHTML = '';
        data.devices.forEach(device => {
            const li = document.createElement('li');
            li.textContent = `${device.name} (Last active: ${new Date(device.last_active).toLocaleString()})`;
            deviceList.appendChild(li);
        });
    }
    if (deviceCount) {
        deviceCount.textContent = `${data.devices.length} / ${data.device_limit}`;
    }
}

// Ad Muter
function initializeAdMuter() {
    chrome.storage.sync.get(['adMuterEnabled', 'subscriptionStatus'], (result) => {
        console.log('InitializeAdMuter - Subscription status:', result.subscriptionStatus);
        console.log('InitializeAdMuter - AdMuter enabled:', result.adMuterEnabled);
        
        const isSubscribed = result.subscriptionStatus === 'active';
        let enabled = result.adMuterEnabled;

        if (isSubscribed) {
            if (enabled === undefined) {
                enabled = true; // Default to true for new subscribers
            }
        } else {
            enabled = false; // Always false for non-subscribers
        }

        chrome.storage.sync.set({ adMuterEnabled: enabled }, updateToggleUI);
    });
}

function handleToggle() {
    const enabled = document.getElementById('adMuterToggle').checked;
    chrome.storage.sync.set({ adMuterEnabled: enabled }, () => {
        console.log('Ad Muter state saved:', enabled);
        updateToggleUI();
        chrome.runtime.sendMessage({ action: 'updateAdMuterState', enabled });
    });
}

// Utilities
async function getAccessToken() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['accessToken', 'tokenExpiry', 'refreshToken'], async (result) => {
            if (result.accessToken && result.tokenExpiry) {
                const decryptedAccessToken = decrypt(result.accessToken);
                if (new Date(result.tokenExpiry) > new Date()) {
                    resolve(decryptedAccessToken);
                } else {
                    try {
                        const decryptedRefreshToken = decrypt(result.refreshToken);
                        const newTokens = await refreshToken(decryptedRefreshToken);
                        if (!newTokens || !newTokens.access_token) {
                            throw new Error('Invalid response from refresh token endpoint');
                        }
                        await storeTokens(newTokens.access_token, newTokens.refresh_token);
                        resolve(newTokens.access_token);
                    } catch (error) {
                        console.error('Error refreshing token:', error);
                        showError('Failed to refresh authentication. Please log in again.');
                        resolve(null);
                    }
                }
            } else {
                console.log('No access token found in storage');
                resolve(null);
            }
        });
    });
}

async function storeTokens(accessToken, refreshToken) {
    const expiryTime = new Date(Date.now() + 3600 * 1000).toISOString(); // 1 hour from now
    await new Promise((resolve) => 
        chrome.storage.local.set({
            accessToken: encrypt(accessToken),
            refreshToken: encrypt(refreshToken),
            tokenExpiry: expiryTime
        }, () => {
            console.log('Tokens stored successfully');
            resolve();
        })
    );
}

async function getDeviceId() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['deviceId'], (result) => {
            if (result.deviceId) {
                resolve(result.deviceId);
            } else {
                const newDeviceId = 'dev_' + Math.random().toString(36).substr(2, 9);
                chrome.storage.local.set({ deviceId: newDeviceId }, () => {
                    resolve(newDeviceId);
                });
            }
        });
    });
}

async function fetchDevices() {
    try {
        const data = await getDevices();
        updateDevicesUI(data);
    } catch (error) {
        showError('Failed to fetch device information');
    }
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
}

function clearUserData() {
    document.getElementById('timeMuted').textContent = '0s';
    document.getElementById('adsMuted').textContent = '0';
    document.getElementById('timeSaved').textContent = '0s';
    if (document.getElementById('subscriptionInfo')) {
        document.getElementById('subscriptionInfo').innerHTML = '';
    }
    if (document.getElementById('deviceList')) {
        document.getElementById('deviceList').innerHTML = '';
    }
    if (document.getElementById('deviceCount')) {
        document.getElementById('deviceCount').textContent = '0 / 0';
    }
}

function showError(message) {
    const errorNotification = document.getElementById('errorNotification');
    const errorMessage = document.getElementById('errorMessage');
    const closeError = document.getElementById('closeError');

    errorMessage.textContent = message;
    errorNotification.classList.remove('hidden');

    closeError.addEventListener('click', () => {
        errorNotification.classList.add('hidden');
    });
}

function showMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.className = 'message';
    messageElement.textContent = message;
    document.body.appendChild(messageElement);
    setTimeout(() => {
        messageElement.remove();
    }, 5000);
}