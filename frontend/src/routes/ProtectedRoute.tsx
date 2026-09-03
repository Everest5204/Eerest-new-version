import {
  useEffect,
  useState,
} from "react";

import {
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";

import {
  getCurrentUser,
} from "../services/authService";

import "./ProtectedRoute.css";

type AuthenticationStatus =
  | "checking"
  | "authenticated"
  | "unauthenticated";

const ProtectedRoute = () => {
  const location = useLocation();
  const token = sessionStorage.getItem("token");

  const [status, setStatus] =
    useState<AuthenticationStatus>(
      token
        ? "checking"
        : "unauthenticated",
    );

  useEffect(() => {
    if (!token) {
      return;
    }

    let isActive = true;

    const validateSession = async () => {
      try {
        await getCurrentUser();

        if (isActive) {
          setStatus("authenticated");
        }
      } catch {
        sessionStorage.removeItem("token");

        if (isActive) {
          setStatus("unauthenticated");
        }
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
        <span
          className="protected-route-spinner"
          aria-hidden="true"
        />

        <span className="protected-route-loader-text">
          Mongosky
        </span>
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

  return <Outlet />;
};

export default ProtectedRoute;
