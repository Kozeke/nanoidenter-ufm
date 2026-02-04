const API_URL = process.env.REACT_APP_BACKEND_URL;

export async function register(email, password) {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Registration failed");
  }

  return res.json();
}

export async function login(email, password) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    throw new Error("Invalid credentials");
  }

  return res.json(); // { access_token }
}

export async function getMe(token) {
  const res = await fetch(`${API_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error("Unauthorized");
  return res.json();
}

export async function getLastAccessedDataset(token) {
  try {
    const res = await fetch(`${API_URL}/datasets/last-accessed`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!res.ok) return null;
    
    const data = await res.json();
    if (data.status === 'success') {
      return {
        dataset_id: data.dataset_id,
        filename: data.name || data.filename  // Use name (custom) if available, otherwise filename (file path)
      };
    }
    return null;
  } catch (err) {
    console.warn('Failed to load last accessed dataset:', err);
    return null;
  }
}

export async function changePassword(token, payload) {
    const res = await fetch(
      `${API_URL}/auth/change-password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      }
    );
  
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Password change failed");
    }
  
    return res.json();
  }
  
  export async function updateProfile(token, payload) {
    const res = await fetch(
      `${process.env.REACT_APP_BACKEND_URL}/auth/me`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      }
    );
  
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Profile update failed");
    }
  
    return res.json();
  }
  