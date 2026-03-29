// src/ui/toast.ts
/* Lightweight toast notification utility.
 * Usage:
 *   import { showToast } from "./toast.js";
 *   showToast("Saved", "my-map");   // label + subject
 *   showToast("Done!");             // plain message (subject omitted)
 *
 * From a plain HTML page (catalog.html etc.), load toast.js as a module
 * and call window.showToast, or import it directly:
 *   <script type="module">
 *     import { showToast } from "/static/toast.js";
 *     showToast("Saved", "my-map");
 *   </script>
 *
 * Styling is driven entirely by CSS variables defined in theme.css.
 * The only rule injected at runtime is the @keyframes animation; all
 * visual tokens come from --toast-* custom properties so callers can
 * override them per-page without touching this file.
 */
const STYLE_ID = "toast-style";
/* Inject the keyframe animation once per document. */
function ensureStyle() {
    if (document.getElementById(STYLE_ID))
        return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        @keyframes toast-in {
            from { translate: 0 0.5rem; }
            to   { translate: 0 0; }
        }
        .toast-el {
            position: fixed;
            bottom: var(--toast-bottom, 1.2rem);
            left: 50%;
            transform: translateX(-50%);
            background: var(--toast-bg, var(--color-hover));
            color: var(--toast-color, var(--color-text));
            padding: var(--toast-padding, 0.5rem 1rem);
            border-radius: var(--toast-radius, 8px);
            font-size: var(--toast-font-size, 20px);
            letter-spacing: var(--toast-letter-spacing, 0.05em);
            font-family: var(--toast-font-family, var(--font-sans));
            font-weight: var(--toast-font-weight, 400);
            box-shadow: var(--toast-shadow, var(--shadow-card));
            border: 1px solid rgba(255, 255, 255, 0.08);
            z-index: 9999;
            pointer-events: none;
            white-space: nowrap;
            animation: toast-in 180ms ease;
            transition: opacity 700ms ease var(--toast-linger, 2500ms);
            display: flex;
            align-items: baseline;
            gap: 0.5em;
        }
        /* Subject (map name etc.) — visually subordinate to the label */
				.toast-subject {
				    font-weight: 400;
				    font-size: 20px;
				    letter-spacing: 0.03em;
				    opacity: 0.85;
				}
    `;
    document.head.appendChild(style);
}
export function showToast(label, subject, options = {}) {
    ensureStyle();
    const el = document.createElement("div");
    el.className = "toast-el";
    if (subject !== undefined) {
        const labelEl = document.createElement("span");
        labelEl.textContent = label;
        const subjectEl = document.createElement("span");
        subjectEl.className = "toast-subject";
        subjectEl.textContent = subject;
        el.appendChild(labelEl);
        el.appendChild(subjectEl);
    }
    else {
        el.textContent = label;
    }
    // Allow per-call linger override via CSS custom property.
    if (options.linger !== undefined) {
        el.style.setProperty("--toast-linger", `${options.linger}ms`);
    }
    document.body.appendChild(el);
    // Double-rAF: the first frame lets the browser paint the element at full
    // opacity; the second frame then sets opacity:0 so the CSS transition
    // (delayed by --toast-linger) actually starts from a visible state.
    // A single rAF is not enough — the transition fires before the initial
    // paint is committed, causing the toast to vanish immediately.
    requestAnimationFrame(() => requestAnimationFrame(() => {
        el.style.opacity = "0";
        el.addEventListener("transitionend", () => el.remove(), { once: true });
    }));
}
