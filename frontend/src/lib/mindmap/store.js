import { createSignal } from "solid-js";

// Mirrors my-mind.js's `currentItem` module state as a Solid signal, so
// Solid components (see PropertyPanel.jsx) can react to selection changes
// without going through pubsub. Written by my-mind.js's selectItem() and
// unmount(); treat as read-only everywhere else.
export const [currentItem, setCurrentItem] = createSignal(null);
