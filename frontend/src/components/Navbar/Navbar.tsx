import { useEffect, useRef, useState } from "react";

import {
  Search,
  Bell,
  MessageCircle,
  Menu,
} from "lucide-react";

import LeftDrawer from "../Drawer/LeftDrawer";

import "./Navbar.css";

const Navbar = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerHistoryRef = useRef(false);

  const openDrawer = () => {
    if (drawerOpen) return;

    window.history.pushState({ drawer: true }, "");
    drawerHistoryRef.current = true;
    setDrawerOpen(true);
  };

  const closeDrawer = (fromBackButton = false) => {
    setDrawerOpen(false);

    if (!fromBackButton && drawerHistoryRef.current) {
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

    window.addEventListener("popstate", handleBackButton);

    return () => {
      window.removeEventListener("popstate", handleBackButton);
    };
  }, [drawerOpen]);

  return (
    <>
      <nav className="navbar">
        <div className="navbar-logo">Everest</div>

        <div className="navbar-actions">
          <button className="nav-icon" type="button">
            <Search size={24} strokeWidth={2.3} />
          </button>

          <button className="nav-icon" type="button">
            <Bell size={24} strokeWidth={2.3} />
          </button>

          <button className="nav-icon" type="button">
            <MessageCircle size={24} strokeWidth={2.3} />
          </button>

          <button className="nav-icon" type="button" onClick={openDrawer}>
            <Menu size={28} strokeWidth={2.4} />
          </button>
        </div>
      </nav>

      <LeftDrawer
        isOpen={drawerOpen}
        onClose={() => closeDrawer(false)}
        onNavigateClose={closeDrawerAfterNavigate}
      />
    </>
  );
};

export default Navbar;