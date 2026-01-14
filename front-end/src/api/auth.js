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
  
