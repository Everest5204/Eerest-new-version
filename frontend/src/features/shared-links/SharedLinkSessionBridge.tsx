import { useEffect } from "react";
import { listenForSharedLinkSession } from "./sharedLinkSession";

/** Lets a copied link in a new tab use an already-open website login session. */
export default function SharedLinkSessionBridge() {
  useEffect(listenForSharedLinkSession, []);
  return null;
}
