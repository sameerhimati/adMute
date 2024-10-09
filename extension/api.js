import { decrypt } from './utils/crypto-utils.js';
const API_URL = 'http://localhost:5000';

async function getAuthenticatedRequest(endpoint, options = {}) {
    try {
        console.log(`Making authenticated request to ${endpoint}...`);
        const { accessToken } = await new Promise((resolve) => 
            chrome.storage.local.get(['accessToken'], resolve)
        );

        if (!accessToken) {
            console.error('No access token available');
            throw new Error('No access token available');
        }

        const decryptedToken = decrypt(accessToken);
        console.log('Access token:', decryptedToken);

        const headers = new Headers(options.headers || {});
        headers.append('Authorization', `Bearer ${decryptedToken}`);

        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers
        });

        console.log(`Response status for ${endpoint}:`, response.status);

        if (response.status === 401 || response.status === 422) {
            console.log('Token might be invalid or expired, attempting to refresh...');
            const newToken = await refreshAccessToken();
            if (newToken) {
                console.log('Token refreshed, retrying request...');
                headers.set('Authorization', `Bearer ${newToken}`);
                return fetch(`${API_URL}${endpoint}`, {
                    ...options,
                    headers
                });
            } else {
                throw new Error('Failed to refresh token');
            }
        }

        return response;
    } catch (error) {
        console.error('Error in getAuthenticatedRequest:', error);
        throw error;
    }
}

  async function refreshAccessToken() {
    try {
      const { refreshToken } = await new Promise((resolve) => 
        chrome.storage.local.get(['refreshToken'], resolve)
      );
  
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }
  
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
  
      if (!response.ok) {
        throw new Error('Failed to refresh token');
      }
  
      const data = await response.json();
      await storeTokens(data.access_token, data.refresh_token);
      return data.access_token;
    } catch (error) {
      console.error('Error refreshing access token:', error);
      return null;
    }
  }

  async function storeTokens(accessToken, refreshToken) {
    const expiryTime = new Date(Date.now() + 3600 * 1000).toISOString(); // 1 hour from now
    await new Promise((resolve) => 
      chrome.storage.local.set({
        accessToken: accessToken,
        refreshToken: refreshToken,
        tokenExpiry: expiryTime
      }, resolve)
    );
  }


  export async function getUserInfo() {
    console.log('Fetching user info...');
    const response = await getAuthenticatedRequest('/auth/user');
    console.log('User info response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to fetch user info:', response.status, errorText);
      throw new Error(`Failed to fetch user info: ${response.status} ${errorText}`);
    }
    
    const data = await response.json();
    console.log('User info data:', data);
    return data;
  }

export async function updateUserMetrics(metrics) {
  const response = await getAuthenticatedRequest('/user/metrics', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metrics)
  });
  if (!response.ok) {
    throw new Error('Failed to update user metrics');
  }
  return response.json();
}

export async function getSubscriptionStatus() {
    try {
        console.log('Fetching subscription status...');
        const response = await getAuthenticatedRequest('/subscription/subscription');
        console.log('Subscription status response:', response.status);
        
        if (response.status === 404) {
            console.log('No active subscription found');
            return { status: 'inactive' };
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to fetch subscription status:', response.status, errorText);
            throw new Error(`Failed to fetch subscription status: ${response.status} ${errorText}`);
        }
        
        const data = await response.json();
        console.log('Subscription data:', data);
        return data;
    } catch (error) {
        console.error('Error in getSubscriptionStatus:', error);
        throw error;
    }
}

export async function registerDevice(deviceId, deviceName) {
  const response = await getAuthenticatedRequest('/devices/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ device_id: deviceId, device_name: deviceName })
  });
  if (!response.ok) {
    throw new Error('Failed to register device');
  }
  return response.json();
}

export async function getDevices() {
  const response = await getAuthenticatedRequest('/devices/list');
  if (!response.ok) {
    throw new Error('Failed to fetch devices');
  }
  return response.json();
}

export async function removeDevice(deviceId) {
  const response = await getAuthenticatedRequest(`/devices/remove/${deviceId}`, {
    method: 'DELETE'
  });
  if (!response.ok) {
    throw new Error('Failed to remove device');
  }
  return response.json();
}

export async function updateDeviceActivity(deviceId) {
  const response = await getAuthenticatedRequest(`/devices/update-activity/${deviceId}`, {
    method: 'POST'
  });
  if (!response.ok) {
    throw new Error('Failed to update device activity');
  }
  return response.json();
}

export async function login(username, password) {
    console.log('Attempting login for user:', username);
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Login failed:', response.status, errorData);
      throw new Error(`Login failed: ${errorData.message || response.statusText}`);
    }
    const data = await response.json();
    console.log('Login successful, received tokens');
    return data;
  }

export async function register(username, email, password) {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, email, password })
  });
  if (!response.ok) {
    throw new Error('Registration failed');
  }
  return response.json();
}

export async function refreshToken(refreshToken) {
    try {
        console.log('Sending refresh token request...');
        const response = await fetch(`${API_URL}/auth/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ refresh_token: refreshToken })
        });
        
        console.log('Refresh token response status:', response.status);
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Refresh token error:', errorData);
            throw new Error(`Failed to refresh token: ${errorData.message || response.statusText}`);
        }
        
        const responseData = await response.json();
        
        if (!responseData.access_token) {
            throw new Error('Server response missing access_token');
        }
        
        console.log('Token refreshed successfully');
        return responseData;
    } catch (error) {
        console.error('Token refresh error:', error);
        throw error;
    }
}

export async function createCheckoutSession(plan) {
  const response = await getAuthenticatedRequest('/subscription/create-checkout-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ plan })
  });
  if (!response.ok) {
    throw new Error('Failed to create checkout session');
  }
  return response.json();
}

export async function cancelSubscription() {
  const response = await getAuthenticatedRequest('/subscription/cancel', {
    method: 'POST'
  });
  if (!response.ok) {
    throw new Error('Failed to cancel subscription');
  }
  return response.json();
}