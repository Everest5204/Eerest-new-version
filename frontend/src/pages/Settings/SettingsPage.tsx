import {
  useCallback,
  type ComponentType,
} from "react";

import {
  BadgeCheck,
  ChevronRight,
  CircleHelp,
  Info,
  KeyRound,
  Languages,
  Moon,
  ShieldCheck,
  Trash2,
  UserRound,
  UserRoundX,
} from "lucide-react";

import {
  useNavigate,
} from "react-router-dom";

import "./SettingsPage.css";

type SettingsItem = {
  id: string;
  label: string;
  icon: ComponentType<{
    size?: number;
    strokeWidth?: number;
  }>;
  path?: string;
  danger?: boolean;
};

const settingsItems: SettingsItem[] = [
  {
    id: "language",
    label: "Language",
    icon: Languages,
  },
  {
    id: "dark-mode",
    label: "Dark Mode",
    icon: Moon,
  },
  {
    id: "personal-details",
    label: "Personal Details",
    icon: UserRound,
  },
  {
    id: "change-password",
    label: "Change Password",
    icon: KeyRound,
  },
  {
    id: "get-verified",
    label: "Get Verified",
    icon: BadgeCheck,
  },
  {
    id: "privacy-policy",
    label: "Privacy Policy",
    icon: ShieldCheck,
    path: "/privacy-policy",
  },
  {
    id: "help-and-support",
    label: "Help and Support",
    icon: CircleHelp,
  },
  {
    id: "deactivate-account",
    label: "Deactivate Account",
    icon: UserRoundX,
    danger: true,
  },
  {
    id: "delete-account",
    label: "Delete Account",
    icon: Trash2,
    danger: true,
  },
  {
    id: "about",
    label: "About",
    icon: Info,
    path: "/about",
  },
];

const SettingsPage = () => {
  const navigate = useNavigate();

  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const handleItemClick = useCallback(
    (path?: string) => {
      if (!path) return;

      navigate(path);
    },
    [navigate],
  );

  return (
    <main className="settings-page">
      <header className="settings-header">
        <button
          type="button"
          className="settings-back-button"
          aria-label="Return to previous page"
          onClick={handleBack}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M15 18L9 12L15 6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <h1>Settings</h1>

        <span
          className="settings-header-spacer"
          aria-hidden="true"
        />
      </header>

      <section
        className="settings-content"
        aria-label="Settings options"
      >
        <ul className="settings-list">
          {settingsItems.map((item) => {
            const Icon = item.icon;
            const isAvailable = Boolean(item.path);

            return (
              <li
                className={[
                  "settings-item",
                  item.danger
                    ? "settings-item-danger"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={item.id}
              >
                <button
                  type="button"
                  className="settings-item-button"
                  disabled={!isAvailable}
                  aria-label={
                    isAvailable
                      ? `Open ${item.label}`
                      : item.label
                  }
                  onClick={() =>
                    handleItemClick(item.path)
                  }
                >
                  <span
                    className="settings-item-icon"
                    aria-hidden="true"
                  >
                    <Icon
                      size={23}
                      strokeWidth={2.15}
                    />
                  </span>

                  <span className="settings-item-label">
                    {item.label}
                  </span>

                  {isAvailable && (
                    <ChevronRight
                      className="settings-item-chevron"
                      size={21}
                      strokeWidth={2.2}
                      aria-hidden="true"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
};

export default SettingsPage;