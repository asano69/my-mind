// Bridges the command system's toggle()/close() calls (see command/command.js's
// Help command and command/edit.js's Cancel command) into the help panel's
// visibility signal, owned by HelpPanel.jsx. Same bridge pattern as title.js's
// registerInput/rename for the title bar.
let toggleAPI = null; // set by HelpPanel's onMount, see components/HelpPanel.jsx

export function registerToggle(api) {
  toggleAPI = api;
}

export function toggle() {
  toggleAPI?.toggle();
}

export function close() {
  toggleAPI?.close();
}

// Called by my-mind.js's unmount(). Only drops the reference to the
// (now-unmounted) HelpPanel's API; the panel's own visibility signal is
// torn down along with the component itself.
export function dispose() {
  toggleAPI = null;
}
