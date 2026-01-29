import { useState } from "react";
import { login as loginApi, getMe } from "../api/auth";
import { useAuthStore } from "../state/useAuthStore";
import { useNavigate, Link } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const login = useAuthStore((s) => s.login);
  const setUser = useAuthStore((s) => s.setUser);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault(); // ✅ Enter key works
    if (loading) return;

    setError("");
    setLoading(true);

    try {
      const res = await loginApi(email, password);
      login(res.access_token);
      
      // Fetch user data to check profile completion status
      const userData = await getMe(res.access_token);
      setUser(userData);
      
      // Navigate based on profile completion status
      navigate(userData.profile_completed ? "/dashboard" : "/profile");
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div style={pageStyle}>
      <form onSubmit={handleSubmit} style={cardStyle}>
        <h2 style={titleStyle}>Sign in</h2>
        <p style={subtitleStyle}>Access your dashboard</p>

        {error && <div style={errorStyle}>{error}</div>}

        <input
          style={inputStyle}
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
        />

        <input
          style={inputStyle}
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
        />

        <button
          type="submit"
          style={{
            ...primaryButtonStyle,
            ...(loading ? disabledButtonStyle : {}),
          }}
          disabled={loading}
        >
          {loading ? <Spinner /> : "Login"}
        </button>

        <p style={footerTextStyle}>
          Don’t have an account?{" "}
          <Link to="/register" style={linkStyle}>
            Register
          </Link>
        </p>
      </form>
    </div>
  );
}

/* ---------------- Spinner ---------------- */

function Spinner() {
  return (
    <div style={spinnerStyle} />
  );
}

/* ---------------- Styles ---------------- */

const pageStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "linear-gradient(180deg, #f4f6f8 0%, #eef1ff 100%)",
};

const cardStyle = {
  width: 360,
  padding: 28,
  background: "linear-gradient(180deg, #ffffff 0%, #fafbff 100%)",
  borderRadius: 14,
  border: "1px solid #e9ecf5",
  boxShadow: "0 18px 40px rgba(20,20,43,0.12)",
  display: "flex",
  flexDirection: "column",
  animation: "fadeSlideIn 0.35s ease-out",
};

const titleStyle = {
  margin: 0,
  fontSize: 24,
  fontWeight: 700,
  color: "#1d1e2c",
};

const subtitleStyle = {
  marginTop: 6,
  marginBottom: 20,
  fontSize: 14,
  color: "#6b7280",
};

const inputStyle = {
  height: 42,
  marginBottom: 14,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid #e6e9f7",
  fontSize: 14,
  outline: "none",
};

const primaryButtonStyle = {
  marginTop: 10,
  height: 42,
  borderRadius: 10,
  border: "none",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  color: "#fff",
  background: "linear-gradient(180deg, #6772ff 0%, #5468ff 100%)",
  boxShadow: "0 8px 16px rgba(90,105,255,0.25)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const disabledButtonStyle = {
  opacity: 0.7,
  cursor: "not-allowed",
};

const errorStyle = {
  marginBottom: 12,
  padding: "8px 10px",
  background: "#fdecea",
  color: "#b91c1c",
  borderRadius: 8,
  fontSize: 13,
};

const footerTextStyle = {
  marginTop: 16,
  fontSize: 13,
  textAlign: "center",
  color: "#4a4f6a",
};

const linkStyle = {
  color: "#5468ff",
  fontWeight: 600,
  textDecoration: "none",
};

/* ---------------- Spinner animation ---------------- */

const spinnerStyle = {
  width: 18,
  height: 18,
  border: "3px solid rgba(255,255,255,0.4)",
  borderTop: "3px solid #fff",
  borderRadius: "50%",
  animation: "spin 0.8s linear infinite",
};

/* ---------------- Keyframes (global) ---------------- */

const styleSheet = document.styleSheets[0];
styleSheet.insertRule(`
@keyframes spin {
  to { transform: rotate(360deg); }
}
`, styleSheet.cssRules.length);

styleSheet.insertRule(`
@keyframes fadeSlideIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
`, styleSheet.cssRules.length);
