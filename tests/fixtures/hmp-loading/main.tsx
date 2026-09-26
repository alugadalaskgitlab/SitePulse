import React from "react";
import { createRoot } from "react-dom/client";
import App from "../../../client/src/App";
import "../../../client/src/index.css";

// Unmodified production components; API interception lives in verify.mjs.
createRoot(document.getElementById("root")!).render(<App />);