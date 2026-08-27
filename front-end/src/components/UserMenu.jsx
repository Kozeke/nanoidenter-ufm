import { useState, useRef, useEffect, forwardRef} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../state/useAuthStore";

export default function UserMenu() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);
  const firstItemRef = useRef(null);

  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const profileCompleted = useAuthStore((s) => s.profileCompleted);

  const [coords, setCoords] = useState({ top: 0, right: 0 });

  const initials = getInitials(user?.email);

  /* ---------- Position dropdown ---------- */
  useEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
      setTimeout(() => firstItemRef.current?.focus(), 0);
    }
  }, [open]);

  /* ---------- Close on outside click ---------- */
  useEffect(() => {
    if (!open) return;

    const onMouseDown = (e) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target) &&
        !buttonRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  /* ---------- ESC + focus trap ---------- */
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }

      if (e.key === "Tab") {
        const focusable = dropdownRef.current.querySelectorAll("[data-menu-item]");
        if (!focusable.length) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        style={avatarButtonStyle}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {initials}
      </button>

      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              ...dropdownStyle,
              top: coords.top,
              right: coords.right,
            }}
            role="menu"
          >
            {/* User info */}
            <div style={userInfoStyle}>
              <div style={avatarLargeStyle}>{initials}</div>
              <div style={emailStyle}>{user?.email || "Unknown user"}</div>
            </div>

            <Divider />

            <MenuItem
              ref={firstItemRef}
              label="Profile"
              onClick={() => navigate("/profile")}
            />
            <MenuItem
              label="My Experiments"
              onClick={() => {
                if (!profileCompleted) {
                  alert("Profile required fields are required. Please complete your profile to access experiments.");
                  navigate("/profile");
                  return;
                }
                navigate("/experiments");
              }}
            />
            <MenuItem
              label="My Datasets"
              onClick={() => {
                if (!profileCompleted) {
                  alert("Profile required fields are required. Please complete your profile to access datasets.");
                  navigate("/profile");
                  return;
                }
                navigate("/datasets");
              }}
            />
            <Divider />
            <MenuItem label="Logout" danger onClick={handleLogout} />
          </div>,
          document.body
        )}
    </>
  );
}

/* ---------- Menu item ---------- */

const MenuItem = forwardRef(({ label, onClick, danger }, ref) => (
  <div
    ref={ref}
    data-menu-item
    tabIndex={0}
    onClick={onClick}
    style={{
      ...itemStyle,
      ...(danger ? dangerStyle : {}),
    }}
  >
    {label}
  </div>
));

/* ---------- Helpers ---------- */

function getInitials(email) {
  if (!email) return "U";
  const name = email.split("@")[0];
  const parts = name.split(/[._-]/);
  return parts.slice(0, 2).map(p => p[0].toUpperCase()).join("");
}

/* ---------- Styles ---------- */

const avatarButtonStyle = {
  height: 36,
  width: 36,
  borderRadius: "50%",
  border: "1px solid #e6e9f7",
  background: "linear-gradient(180deg, #6772ff 0%, #5468ff 100%)",
  color: "#fff",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
  boxShadow: "0 6px 14px rgba(20,20,43,0.12)",
};

const dropdownStyle = {
  position: "fixed",
  width: 220,
  background: "linear-gradient(180deg, #ffffff 0%, #fafbff 100%)",
  borderRadius: 12,
  border: "1px solid #e9ecf5",
  boxShadow: "0 18px 40px rgba(20,20,43,0.15)",
  padding: "8px 0",
  zIndex: 99999,
};

const userInfoStyle = {
  padding: "10px 14px",
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const avatarLargeStyle = {
  height: 32,
  width: 32,
  borderRadius: "50%",
  background: "linear-gradient(180deg, #6772ff 0%, #5468ff 100%)",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  fontSize: 12,
};

const emailStyle = {
  fontSize: 13,
  color: "#1d1e2c",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const itemStyle = {
  padding: "10px 14px",
  fontSize: 14,
  fontWeight: 500,
  color: "#1d1e2c",
  cursor: "pointer",
};

const dangerStyle = {
  color: "#b91c1c",
};

const Divider = () => (
  <div style={{ height: 1, margin: "6px 0", background: "#e6e9f7" }} />
);
