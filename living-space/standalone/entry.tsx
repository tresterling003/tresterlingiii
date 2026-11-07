/**
 * Entry point for the single-file / desktop build. Renders the same <App /> as the website,
 * flagged as standalone so it runs without the Next.js server.
 */
import { createRoot } from "react-dom/client";
import { App } from "@/ui/App";

window.__LIVING_SPACE_STANDALONE__ = true;
createRoot(document.getElementById("root")!).render(<App />);
