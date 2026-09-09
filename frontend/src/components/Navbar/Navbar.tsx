import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import {
  Search,
  Bell,
  MessageCircle,
  Menu,
} from "lucide-react";

import LeftDrawer from "../Drawer/LeftDrawer";

import {
  useNotificationUnreadCount,
} from "../Notification/Core/useNotifications";

import "./Navbar.css";

const Navbar = () => {
  const navigate = useNavigate();

  const unreadCount = useNotificationUnreadCount();

  const [drawerOpen, setDrawerOpen] =
    useState(false);

  const drawerHistoryRef =
    useRef(false);

  const openDrawer = () => {
    if (drawerOpen) return;

    window.history.pushState(
      {
        drawer: true,
      },
      "",
    );

    drawerHistoryRef.current = true;

    setDrawerOpen(true);
  };

  const closeDrawer = (
    fromBackButton = false,
  ) => {
    setDrawerOpen(false);

    if (
      !fromBackButton &&
      drawerHistoryRef.current
    ) {
      drawerHistoryRef.current = false;

      window.history.back();
    }
  };

  const closeDrawerAfterNavigate = () => {
    drawerHistoryRef.current = false;

    setDrawerOpen(false);
  };

  useEffect(() => {
    const handleBackButton = () => {
      if (drawerOpen) {
        drawerHistoryRef.current = false;

        closeDrawer(true);
      }
    };

    window.addEventListener(
      "popstate",
      handleBackButton,
    );

    return () => {
      window.removeEventListener(
        "popstate",
        handleBackButton,
      );
    };
  }, [drawerOpen]);

  return (
    <>
      <nav className="navbar">
        <div className="navbar-logo">
          Mongoksy
        </div>

        <div className="navbar-actions">
          <button
            className="nav-icon"
            type="button"
            aria-label="Search people"
            onClick={() =>
              navigate("/search")
            }
          >
            <Search
              size={24}
              strokeWidth={2.3}
            />
          </button>

          <button
            className="nav-icon navbar-notification-button"
            type="button"
            aria-label={
              unreadCount > 0
                ? `Notifications, ${unreadCount} unread`
                : "Notifications"
            }
            onClick={() =>
              navigate("/notifications")
            }
          >
            <Bell
              size={24}
              strokeWidth={2.3}
              aria-hidden="true"
              focusable="false"
            />

            {unreadCount > 0 && (
              <span
                className="navbar-notification-badge"
                aria-hidden="true"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          <button
            className="nav-icon"
            type="button"
            aria-label="Messages"
            onClick={() =>
              window.alert(
                "Messaging is currently unavailable.",
              )
            }
          >
            <MessageCircle
              size={24}
              strokeWidth={2.3}
              aria-hidden="true"
              focusable="false"
            />
          </button>

          <button
            className="nav-icon"
            type="button"
            onClick={openDrawer}
          >
            <Menu
              size={28}
              strokeWidth={2.4}
            />
          </button>
        </div>
      </nav>

      <LeftDrawer
        isOpen={drawerOpen}
        onClose={() =>
          closeDrawer(false)
        }
        onNavigateClose={
          closeDrawerAfterNavigate
        }
      />
    </>
  );
};

export default Navbar;