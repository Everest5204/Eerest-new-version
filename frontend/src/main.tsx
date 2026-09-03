import ReactDOM from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";

import App from "./App";
import "./index.css";

const googleClientId =
  import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();

if (!googleClientId) {
  throw new Error(
    "VITE_GOOGLE_CLIENT_ID is missing from frontend/.env"
  );
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element was not found");
}

ReactDOM.createRoot(rootElement).render(
  <GoogleOAuthProvider clientId={googleClientId}>
    <App />
  </GoogleOAuthProvider>
);