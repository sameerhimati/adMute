const API_URL = 'http://localhost:5000';

async function getAuthenticatedRequest(endpoint, options = {}) {
  const { accessToken } = await new Promise((resolve) => 
    chrome.storage.local.get(['accessToken'], resolve)
  );

  if (!accessToken) {
    throw new Error('No access token available');
  }

  const headers = new Headers(options.headers || {});
  headers.append('Authorization', `Bearer ${accessToken}`);

  return fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers
  });
}

export async function getUserInfo() {
  const response = await getAuthenticatedRequest('/auth/user');
  if (!response.ok) {
    throw new Error('Failed to fetch user info');
  }
  return response.json();
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
      const response = await getAuthenticatedRequest('/subscription/subscription');
      if (response.status === 404) {
        // No active subscription
        return { status: 'inactive' };
      }
      if (!response.ok) {
        throw new Error('Failed to fetch subscription status');
      }
      return response.json();
    } catch (error) {
      console.error('Error fetching subscription status:', error);
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
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, password })
  });
  if (!response.ok) {
    throw new Error('Login failed');
  }
  return response.json();
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
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to refresh token');
      }
      
      return response.json();
    } catch (error) {
      console.error('Token refresh error:', error);
      throw error;
    }
  }

export async function createSubscription(plan, paymentMethodId) {
  const response = await getAuthenticatedRequest('/subscription/subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ plan, payment_method_id: paymentMethodId })
  });
  if (!response.ok) {
    throw new Error('Failed to create subscription');
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