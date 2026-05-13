import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installClerkFetchInterceptor } from "./lib/clerkFetch";

// Install before React mounts so the very first API call from any component
// already carries the Clerk Bearer token (once Clerk has loaded).
installClerkFetchInterceptor();

createRoot(document.getElementById("root")!).render(<App />);
