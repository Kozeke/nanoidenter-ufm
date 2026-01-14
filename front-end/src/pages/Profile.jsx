import { useState } from "react";
import { useAuthStore } from "../state/useAuthStore";
import { changePassword } from "../api/auth";
import BackToDashboardButton from "../components/BackToDashboardButton";

export default function Profile() {
  const user = useAuthStore((s) => s.user);

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ marginBottom: 12 }}>
            <BackToDashboardButton />
        </div>
        {/* Header */}
        <div style={headerStyle}>
          <div style={avatarStyle}>{getInitials(user?.email)}</div>
          <div>
            <h2 style={titleStyle}>Profile</h2>
            <p style={subtitleStyle}>Account information</p>
          </div>
        </div>

        {/* Info */}
        <div style={sectionStyle}>
          <ProfileRow label="Email" value={user?.email || "—"} />
        </div>

        {/* Change password */}
        <ChangePasswordSection />
      </div>
    </div>
  );
}

/* ---------- Change Password ---------- */
function ChangePasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const token = useAuthStore((s) => s.token);
  const strength = getPasswordStrength(next);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!current || !next || !confirm) {
      setError("All fields are required");
      return;
    }
    if (next.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (next !== confirm) {
      setError("Passwords do not match");
      return;
    }

    if (strength < 3) {
        setError("Password is too weak");
        return;
    }
      
    setLoading(true);
    try {
      // 🔧 backend call will go here later
      await changePassword(token, {
        current_password: current,
        new_password: next,
      });
      
      setSuccess("Password changed successfully");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError("Failed to change password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={passwordSectionStyle}>
      <h3 style={sectionTitleStyle}>Change password</h3>

      <form onSubmit={handleSubmit} style={formStyle}>
        {error && <div style={errorStyle}>{error}</div>}
        {success && <div style={successStyle}>{success}</div>}

        <input
          style={inputStyle}
          type="password"
          placeholder="Current password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          disabled={loading}
        />
        <input
          style={inputStyle}
          type="password"
          placeholder="New password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          disabled={loading}
        />
        <input
          style={inputStyle}
          type="password"
          placeholder="Confirm new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={loading}
        />
        <div style={strengthWrapperStyle}>
        <div
            style={{
            ...strengthBarStyle,
            width: `${(strength / 5) * 100}%`,
            background: strengthColor[strength],
            }}
        />
        </div>

        <div style={strengthTextStyle}>
        {strengthLabel[strength]}
        </div>
                <button
                type="submit"
                style={{
                    ...primaryButtonStyle,
                    ...(loading ? disabledButtonStyle : {}),
                }}
                disabled={loading}
                >
                {loading ? "Saving..." : "Update password"}
                </button>
            </form>
            </div>
        );
        }

/* ---------- Small components ---------- */
function ProfileRow({ label, value }) {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <span style={valueStyle}>{value}</span>
    </div>
  );
}

function getPasswordStrength(password) {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
  
    return score;
  }
  
/* ---------- Helpers ---------- */
function getInitials(email) {
  if (!email) return "U";
  return email[0].toUpperCase();
}

/* ---------- Styles ---------- */
const pageStyle = {
  padding: "24px 16px",
  minHeight: "100vh",
  display: "flex",
  justifyContent: "center",
  background: "#f8f9fc",
};

const cardStyle = {
  width: "100%",
  maxWidth: "640px",
  background: "white",
  borderRadius: 16,
  border: "1px solid #e5e7eb",
  boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
  padding: "32px",
  boxSizing: "border-box",
};

const headerStyle = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  marginBottom: 32,
};

const avatarStyle = {
  height: 56,
  width: 56,
  borderRadius: "50%",
  background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
  color: "white",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  fontSize: 20,
  flexShrink: 0,
};

const titleStyle = {
  margin: 0,
  fontSize: 24,
  fontWeight: 700,
  color: "#111827",
};

const subtitleStyle = {
  margin: "4px 0 0 0",
  fontSize: 14,
  color: "#6b7280",
};

const sectionStyle = {
  borderTop: "1px solid #f1f5f9",
  paddingTop: 20,
  marginBottom: 32,
};

const passwordSectionStyle = {
  borderTop: "1px solid #f1f5f9",
  paddingTop: 24,
};

const sectionTitleStyle = {
  margin: "0 0 16px 0",
  fontSize: 18,
  fontWeight: 600,
  color: "#111827",
};

const formStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const rowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "14px 0",
  borderBottom: "1px solid #f1f5f9",
  fontSize: 14,
};

const labelStyle = {
  color: "#4b5563",
  fontWeight: 500,
};

const valueStyle = {
  fontWeight: 600,
  color: "#111827",
  textAlign: "right",
  wordBreak: "break-all",
};

const inputStyle = {
  width: "100%",
  height: 44,
  padding: "0 16px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  fontSize: 15,
  outline: "none",
  transition: "border-color 0.2s",
  boxSizing: "border-box",
  background: "#ffffff",
  // :focus style simulated via outline
  // you can also add :focus { borderColor: "#6366f1", boxShadow: "0 0 0 3px rgba(99,102,241,0.1)" }
};

const primaryButtonStyle = {
  height: 44,
  marginTop: 8,
  borderRadius: 10,
  border: "none",
  fontWeight: 600,
  fontSize: 15,
  cursor: "pointer",
  color: "white",
  background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
  transition: "all 0.2s",
};

const disabledButtonStyle = {
  opacity: 0.65,
  cursor: "not-allowed",
};

const errorStyle = {
  padding: "12px 16px",
  background: "#fee2e2",
  color: "#991b1b",
  borderRadius: 10,
  fontSize: 14,
  border: "1px solid #fecaca",
};

const successStyle = {
  padding: "12px 16px",
  background: "#ecfdf5",
  color: "#065f46",
  borderRadius: 10,
  fontSize: 14,
  border: "1px solid #a7f3d0",
};

const strengthWrapperStyle = {
    height: 6,
    borderRadius: 4,
    background: "#e5e7eb",
    marginBottom: 6,
  };
  
  const strengthBarStyle = {
    height: "100%",
    borderRadius: 4,
    transition: "width 0.3s ease",
  };
  
  const strengthTextStyle = {
    fontSize: 12,
    marginBottom: 10,
    color: "#6b7280",
  };
  
  const strengthColor = {
    0: "#e5e7eb",
    1: "#ef4444",
    2: "#f97316",
    3: "#eab308",
    4: "#22c55e",
    5: "#16a34a",
  };
  
  const strengthLabel = {
    0: "Enter a password",
    1: "Very weak",
    2: "Weak",
    3: "Medium",
    4: "Strong",
    5: "Very strong",
  };
  