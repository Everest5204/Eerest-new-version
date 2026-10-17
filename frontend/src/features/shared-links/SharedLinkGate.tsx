import { useEffect, useReducer } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import NotificationProvider from "../../components/Notification/Core/NotificationProvider";
import { sharedLinkAuthURL } from "./sharedLinkDestination";
import { restoreSharedLinkSession } from "./sharedLinkSession";
import { SharedLinkError, validateSharedSession } from "./sharedLinkApi";
import "./SharedLinks.css";

type State = { path: string; status: "checking" | "authenticated" | "signup" | "error"; token: string | null; error?: string };
type Action = State;
const reducer = (_state: State, action: Action): State => action;

export default function SharedLinkGate() {
  const location = useLocation();
  const path = location.pathname;
  const [attempt, retry] = useReducer((count: number) => count + 1, 0);
  const [state, dispatch] = useReducer(reducer, { path, status: "checking", token: null });
  const status = state.path === path ? state.status : "checking";

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      dispatch({ path, status: "checking", token: null });
      let token: string | null = null;
      try {
        token = await restoreSharedLinkSession(path, controller.signal);
        if (controller.signal.aborted) return;
        if (!token) { dispatch({ path, status: "signup", token: null }); return; }
        await validateSharedSession(token, controller.signal);
        if (controller.signal.aborted) return;
        if (sessionStorage.getItem("token") === token) {
          dispatch({ path, status: "authenticated", token });
        } else {
          dispatch({ path, status: "error", token: null, error: "Your browser session changed. Please try again." });
        }
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        if (error instanceof SharedLinkError && (error.status === 401 || error.status === 403)) {
          if (sessionStorage.getItem("token") === token) sessionStorage.removeItem("token");
          dispatch({ path, status: "signup", token: null });
        } else {
          dispatch({ path, status: "error", token: null, error: error instanceof Error ? error.message : "Could not connect. Please try again." });
        }
      }
    })();
    return () => controller.abort();
  }, [path, attempt]);

  if (status === "signup") return <Navigate to={sharedLinkAuthURL("/signup", path)} replace state={{ from: path }} />;
  if (status === "error") return <main className="shared-link-status" role="alert"><h1>Unable to open this link</h1><p>{state.error}</p><button onClick={retry}>Try again</button></main>;
  if (status !== "authenticated") return <main className="shared-link-status" role="status"><span className="shared-link-spinner" /><p>Opening Mongosky…</p></main>;
  return <NotificationProvider token={state.token}><Outlet /></NotificationProvider>;
}
