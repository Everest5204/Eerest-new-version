import { useEffect, useState } from "react";

import { Navigate, Outlet, useLocation } from "react-router-dom";

import NotificationProvider from "../components/Notification/Core/NotificationProvider";
import { getCurrentUser } from "../services/authService";

import "./ProtectedRoute.css";

type AuthenticationStatus =
  | "checking"
  | "authenticated"
  | "unauthenticated";

interface SessionCheck {
  readonly token: string | null;
  readonly status: AuthenticationStatus;
}

const ProtectedRoute = () => {
  const location = useLocation();
  const token = sessionStorage.getItem("token");

  const [session, setSession] = useState<SessionCheck>(() => ({
    token,
    status: token ? "checking" : "unauthenticated",
  }));

  // A different token must be verified before mounting its notification provider.
  const status: AuthenticationStatus = !token
    ? "unauthenticated"
    : session.token === token
      ? session.status
      : "checking";

  useEffect(() => {
    if (!token) return;

    let isActive = true;

    const ownsSession = () =>
      isActive && sessionStorage.getItem("token") === token;

    const validateSession = async () => {
      if (!ownsSession()) return;

      try {
        await getCurrentUser();

        if (ownsSession()) {
          setSession({ token, status: "authenticated" });
        }
      } catch {
        // An old request must not remove a newer login's token.
        if (!ownsSession()) return;

        sessionStorage.removeItem("token");
        setSession({ token, status: "unauthenticated" });
      }
    };

    void validateSession();

    return () => {
      isActive = false;
    };
  }, [token]);

  if (status === "checking") {
    return (
      <main
        className="protected-route-loader"
        role="status"
        aria-live="polite"
        aria-label="Checking your session"
      >
        <span className="protected-route-spinner" aria-hidden="true" />

        <span className="protected-route-loader-text">Mongosky</span>
      </main>
    );
  }

  if (status === "unauthenticated") {
    return (
      <Navigate
        to="/signup"
        replace
        state={{
          from: `${location.pathname}${location.search}`,
        }}
      />
    );
  }

  return (
    <NotificationProvider token={token}>
      <Outlet />
    </NotificationProvider>
  );
};

export default ProtectedRoute;
