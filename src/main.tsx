import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import "./styles.css";

// The macOS webview applies system autocorrect/auto-capitalization to
// text fields, which mangles identifiers like repo slugs and usernames.
// Stamp every input/textarea (current and future) to opt out.
function disableAutocorrect(root: ParentNode) {
  root.querySelectorAll("input, textarea").forEach((el) => {
    el.setAttribute("autocorrect", "off");
    el.setAttribute("autocapitalize", "off");
    el.setAttribute("spellcheck", "false");
  });
}
const observer = new MutationObserver(() => {
  disableAutocorrect(document);
});
observer.observe(document.documentElement, { childList: true, subtree: true });
disableAutocorrect(document);

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
