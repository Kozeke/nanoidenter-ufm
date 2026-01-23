import { useState, useRef, useEffect } from "react";
import { useAuthStore } from "../state/useAuthStore";
import { changePassword } from "../api/auth";
import BackToDashboardButton from "../components/BackToDashboardButton";
import { updateProfile } from "../api/auth";

export default function Profile() {
  const [activeTab, setActiveTab] = useState("profile");
  const errorRef = useRef(null);

  const user = useAuthStore((s) => s.user);
  const [error, setError] = useState("");
  const token = useAuthStore((s) => s.token);
  const setUser = useAuthStore((s) => s.setUser);
  const [fieldErrors, setFieldErrors] = useState({});

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    full_name: user?.full_name || "",
    affiliation: user?.affiliation || "",
    instrument_serial_number: user?.instrument_serial_number || "",
    bio: user?.bio || "",
    phone_number: user?.phone_number || "",
  });
  const handleSaveProfile = async () => {
    setError("");
    setFieldErrors({});

    const errors = {};

    if (!form.full_name.trim()) {
      errors.full_name = "Full name is required";
    }
    if (!form.affiliation.trim()) {
      errors.affiliation = "Affiliation is required";
    }
    if (!form.instrument_serial_number.trim()) {
      errors.instrument_serial_number = "Instrument serial number is required";
    }

    if (form.bio && form.bio.length > 500) {
      errors.bio = "Bio must be under 500 characters";
    }

    if (
      form.phone_number &&
      !/^\+?[0-9\s\-()]{7,20}$/.test(form.phone_number)
    ) {
      errors.phone_number = "Invalid phone number format";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError("Please fix the highlighted fields");
      return;
    }

    try {
      const updatedUser = await updateProfile(token, form);
      setUser(updatedUser);
      setEditing(false);
      setError("");
      setFieldErrors({});
    } catch (e) {
      setError(e.message || "Failed to update profile");
    }
  };
  useEffect(() => {
    if (!user) return
    setForm((prev) => ({
      ...prev,
      full_name: prev.full_name || user.full_name || "",
      affiliation: prev.affiliation || user.affiliation || "",
      instrument_serial_number: prev.instrument_serial_number || user.instrument_serial_number || "",
      bio: prev.bio || user.bio || "",
      phone_number: prev.phone_number || user.phone_number || ""
    }));
  }, [user]);
  
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [error]);

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
        {/* 🔴 GLOBAL ERROR */}
        {error && (
          <div ref={errorRef} style={globalErrorStyle}>
            {error}
          </div>
        )}
        <div style={tabBarStyle}>
          <button
            style={{
              ...tabStyle,
              ...(activeTab === "profile" ? activeTabStyle : {}),
            }}
            onClick={() => setActiveTab("profile")}
          >
            Profile
          </button>

          <button
            style={{
              ...tabStyle,
              ...(activeTab === "security" ? activeTabStyle : {}),
            }}
            onClick={() => setActiveTab("security")}
          >
            Security
          </button>
        </div>
        {activeTab === "profile" && (
          <div style={sectionStyle}>
            {/* Info */}
            <div style={sectionStyle}>
              <EditableRow
                label="Email"
                value={user?.email || ""}
                disabled
                rightAddon={<VerifiedBadge />}
              />

              <EditableRow
                label="Full Name"
                required
                value={form.full_name}
                error={fieldErrors.full_name}
                disabled={!editing}
                onChange={(v) => {
                  setForm({ ...form, full_name: v });
                  setFieldErrors((e) => ({ ...e, full_name: undefined }));
                }}
              />

              <EditableRow
                label="Affiliation"
                required
                value={form.affiliation}
                error={fieldErrors.affiliation}
                disabled={!editing}
                onChange={(v) => {
                  setForm({ ...form, affiliation: v });
                  setFieldErrors((e) => ({ ...e, affiliation: undefined }));
                }}
              />

              <EditableRow
                label="Instrument Serial Number"
                required
                value={form.instrument_serial_number}
                error={fieldErrors.instrument_serial_number}
                disabled={!editing}
                onChange={(v) => {
                  setForm({ ...form, instrument_serial_number: v });
                  setFieldErrors((e) => ({
                    ...e,
                    instrument_serial_number: undefined,
                  }));
                }}
              />
              <EditableRow
                label="Bio"
                optional
                multiline
                error={fieldErrors.bio}
                value={form.bio}
                disabled={!editing}
                onChange={(v) => {
                  setForm({ ...form, bio: v });
                  setFieldErrors((e) => ({ ...e, bio: undefined }));
                }}
              />

              <EditableRow
                label="Phone Number"
                optional
                placeholder="+39 333 123 4567"
                value={form.phone_number}
                error={fieldErrors.phone_number}
                disabled={!editing}
                onChange={(v) => {
                  setForm({ ...form, phone_number: v });
                  setFieldErrors((e) => ({ ...e, phone_number: undefined }));
                }}
              />

              {!editing ? (
                <button
                  style={primaryButtonStyle}
                  onClick={() => setEditing(true)}
                >
                  Edit profile
                </button>
              ) : (
                <div style={{ display: "flex", gap: 12 }}>
                  <button
                    style={primaryButtonStyle}
                    onClick={handleSaveProfile}
                  >
                    Save changes
                  </button>
                  <button
                    style={secondaryButtonStyle}
                    onClick={() => {
                      setForm({
                        full_name: user?.full_name || "",
                        affiliation: user?.affiliation || "",
                        instrument_serial_number:
                          user?.instrument_serial_number || "",
                        bio: user?.bio || "",
                        phone_number: user?.phone_number || "",
                      });
                      setEditing(false);
                      setError("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        {activeTab === "security" && (
          <div style={sectionStyle}>
            {/* Change password */}
            <ChangePasswordSection setGlobalError={setError} />{" "}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Change Password ---------- */
function ChangePasswordSection({ setGlobalError }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const token = useAuthStore((s) => s.token);
  const strength = getPasswordStrength(next);
  const [fieldErrors, setFieldErrors] = useState({});
  const [show, setShow] = useState({
    current: false,
    next: false,
    confirm: false,
  });
  const [capsLockOn, setCapsLockOn] = useState(false);
  const currentRef = useRef(null);
  const nextRef = useRef(null);
  const confirmRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGlobalError("");
    setSuccess("");
    setFieldErrors({});

    const errors = {};

    if (!current) {
      errors.current = "Current password is required";
    }
    if (!next) {
      errors.next = "New password is required";
    } else if (next.length < 8) {
      errors.next = "Must be at least 8 characters";
    } else if (strength < 3) {
      errors.next = "Password is too weak";
    }

    if (!confirm) {
      errors.confirm = "Please confirm your password";
    } else if (next !== confirm) {
      errors.confirm = "Passwords do not match";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setGlobalError("Please fix the highlighted fields");
      return;
    }

    setLoading(true);
    try {
      await changePassword(token, {
        current_password: current,
        new_password: next,
      });

      setSuccess("Password changed successfully");
      setCurrent("");
      setNext("");
      setConfirm("");
      setFieldErrors({});
    } catch {
      setGlobalError("Failed to change password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={passwordSectionStyle}>
      <h3 style={sectionTitleStyle}>Change password</h3>

      <form onSubmit={handleSubmit} style={formStyle}>
        {success && <div style={successStyle}>{success}</div>}
        <div style={{ display: "flex", alignItems: "center" }}>
          <input
            ref={currentRef}
            style={{
              ...inputStyle,
              border: fieldErrors.current
                ? "1px solid #ef4444"
                : "1px solid #d1d5db",
              boxShadow: fieldErrors.current
                ? "0 0 0 3px rgba(239,68,68,0.15)"
                : "none",
            }}
            type={show.current ? "text" : "password"}
            placeholder="Current password"
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value);
              setFieldErrors((s) => ({ ...s, current: undefined }));
            }}
            onKeyUp={(e) => setCapsLockOn(e.getModifierState("CapsLock"))}
            onBlur={() => setCapsLockOn(false)}
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && current) {
                nextRef.current?.focus();
              }
            }}
          />
          {capsLockOn && <div style={capsLockStyle}>Caps Lock is on</div>}

          <EyeToggle
            visible={show.current}
            onClick={() => setShow((s) => ({ ...s, current: !s.current }))}
          />
        </div>
        {fieldErrors.current && (
          <div style={fieldErrorTextStyle}>{fieldErrors.current}</div>
        )}

        <div style={{ display: "flex", alignItems: "center" }}>
          <input
            ref={nextRef}
            style={{
              ...inputStyle,
              border: fieldErrors.next
                ? "1px solid #ef4444"
                : "1px solid #d1d5db",
              boxShadow: fieldErrors.next
                ? "0 0 0 3px rgba(239,68,68,0.15)"
                : "none",
            }}
            type={show.next ? "text" : "password"}
            placeholder="New password"
            value={next}
            onChange={(e) => {
              setNext(e.target.value);
              setFieldErrors((s) => ({ ...s, next: undefined }));
            }}
            disabled={loading}
            onKeyUp={(e) => setCapsLockOn(e.getModifierState("CapsLock"))}
            onBlur={() => setCapsLockOn(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && next.length >= 8 && strength >= 3) {
                confirmRef.current?.focus();
              }
            }}
          />

          <EyeToggle
            visible={show.next}
            onClick={() => setShow((s) => ({ ...s, next: !s.next }))}
          />
        </div>

        {fieldErrors.next && (
          <div style={fieldErrorTextStyle}>{fieldErrors.next}</div>
        )}
        <div style={{ display: "flex", alignItems: "center" }}>
          <input
            ref={confirmRef}
            style={{
              ...inputStyle,
              border: fieldErrors.confirm
                ? "1px solid #ef4444"
                : "1px solid #d1d5db",
              boxShadow: fieldErrors.confirm
                ? "0 0 0 3px rgba(239,68,68,0.15)"
                : "none",
            }}
            type={show.confirm ? "text" : "password"}
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              setFieldErrors((s) => ({ ...s, confirm: undefined }));
            }}
            onKeyUp={(e) => setCapsLockOn(e.getModifierState("CapsLock"))}
            onBlur={() => setCapsLockOn(false)}
            disabled={loading}
          />

          {fieldErrors.confirm && (
            <div style={fieldErrorTextStyle}>{fieldErrors.confirm}</div>
          )}
          <EyeToggle
            visible={show.confirm}
            onClick={() => setShow((s) => ({ ...s, confirm: !s.confirm }))}
          />
        </div>
        <div style={strengthWrapperStyle} title={strengthTooltipText}>
          <div
            style={{
              ...strengthBarStyle,
              width: `${(strength / 5) * 100}%`,
              background: strengthColor[strength],
            }}
          />
        </div>

        <div style={strengthTextStyle}>{strengthLabel[strength]}</div>
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
function EditableRow({
  label,
  value,
  error,
  required,
  optional,
  disabled,
  multiline,
  placeholder,
  rightAddon,
  onChange,
}) {
  const Input = multiline ? "textarea" : "input";

  return (
    <div style={rowStyle}>
      <span style={labelStyle}>
        {label}
        {required && <span style={{ color: "#ef4444" }}> *</span>}
        {optional && (
          <span style={{ color: "#9ca3af", fontSize: 12 }}> (optional)</span>
        )}
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <Input
              style={{
                ...inputStyle,
                maxWidth: 260,
                minHeight: multiline ? 80 : 44,
                resize: multiline ? "vertical" : "none",
                background: disabled ? "#f3f4f6" : "#fff",
                cursor: disabled ? "not-allowed" : "text",
                border: error ? "1px solid #ef4444" : "1px solid #d1d5db",
                boxShadow: error ? "0 0 0 3px rgba(239,68,68,0.15)" : "none",
              }}
              value={value}
              placeholder={placeholder}
              disabled={disabled}
              onChange={(e) => onChange?.(e.target.value)}
            />
            {rightAddon && <div style={rightAddonStyle}>{rightAddon}</div>}
          </div>

          {error && <div style={fieldErrorTextStyle}>{error}</div>}
        </div>
      </div>
    </div>
  );
}

function VerifiedBadge() {
  return (
    <span style={verifiedBadgeWrapperStyle}>
      <span style={verifiedBadgePulseStyle} />
      <span style={verifiedBadgeStyle}>✓</span>
    </span>
  );
}
function EyeToggle({ visible, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={visible ? "Hide password" : "Show password"}
      style={eyeButtonStyle}
    >
      {visible ? <EyeOffIcon /> : <EyeIcon />}
    </button>
  );
}

function EyeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      style={{ display: "block" }}   // 🔑 prevents clipping
    >
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="12"
        r="3"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}


function EyeOffIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      style={{ display: "block" }}
    >
      {/* Eye */}
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle
        cx="12"
        cy="12"
        r="3"
        stroke="currentColor"
        strokeWidth="1.6"
      />

      {/* Slash */}
      <path
        d="M4 4l16 16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
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
const strengthTooltipText =
  "Use at least 8 characters, uppercase, lowercase, numbers, and symbols";
/* ---------- Styles ---------- */
const eyeButtonStyle = {
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontSize: 16,
  padding: "0 6px",
  height: 44,
  display: "flex",
  alignItems: "center",
  color: "#6b7280",
};
const capsLockStyle = {
  marginTop: 4,
  fontSize: 12,
  color: "#b45309",
};

const verifiedBadgeWrapperStyle = {
  position: "relative",
  width: 18,
  height: 18,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};
const tabBarStyle = {
  display: "flex",
  gap: 8,
  marginBottom: 24,
  borderBottom: "1px solid #e5e7eb",
};
const fieldErrorTextStyle = {
  marginTop: 6,
  fontSize: 12,
  color: "#dc2626",
  lineHeight: 1.4,
};
const rightAddonStyle = {
  marginLeft: 6,
  height: 44, // same as input height
  display: "flex",
  alignItems: "center",
};

const globalErrorStyle = {
  marginBottom: 16,
  padding: "12px 16px",
  borderRadius: 10,
  background: "#fee2e2",
  border: "1px solid #fecaca",
  color: "#991b1b",
  fontSize: 14,
  fontWeight: 500,
};

const tabStyle = {
  padding: "10px 14px",
  fontSize: 14,
  fontWeight: 600,
  border: "none",
  background: "none",
  cursor: "pointer",
  color: "#6b7280",
  borderBottom: "2px solid transparent",
};

const activeTabStyle = {
  color: "#4f46e5",
  borderBottom: "2px solid #4f46e5",
};

const verifiedBadgeStyle = {
  width: 18,
  height: 18,
  borderRadius: "50%",
  background: "#1d9bf0", // Telegram / Instagram blue
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 800,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2,
  boxShadow: "0 2px 6px rgba(29,155,240,0.45)",
};

const verifiedBadgePulseStyle = {
  position: "absolute",
  width: 18,
  height: 18,
  borderRadius: "50%",
  background: "rgba(29,155,240,0.35)",
  animation: "verifiedPulse 1.6s ease-out",
  zIndex: 1,
};

const pageStyle = {
  padding: "24px 16px",
  minHeight: "100vh",
  display: "flex",
  justifyContent: "center",
  background: "#f8f9fc",
};
const secondaryButtonStyle = {
  height: 44,
  marginTop: 8,
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  fontWeight: 600,
  fontSize: 15,
  cursor: "pointer",
  color: "#374151",
  background: "#ffffff",
  transition: "all 0.2s",
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
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.innerHTML = `
    @keyframes verifiedPulse {
      0% {
        transform: scale(1);
        opacity: 0.9;
      }
      100% {
        transform: scale(2.4);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
}
