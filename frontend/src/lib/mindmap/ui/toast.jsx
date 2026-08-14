import { Toast, toaster } from "@kobalte/core/toast";

/* Toast notification utility, backed by Kobalte's Toast primitive (see
 * components/ToastRegion.jsx for the mounted viewport). Usage unchanged
 * from callers' perspective:
 *   import { showToast } from "./toast.jsx";
 *   showToast("Saved", "my-map");   // label + subject
 *   showToast("Done!");             // plain message (subject omitted)
 *
 * Kobalte owns entrance/exit animation, stacking, and the auto-dismiss
 * timer (options.linger maps to its `duration` prop). The progress bar
 * below (Toast.ProgressTrack/ProgressFill) is also driven by that same
 * timer via Kobalte's --kb-toast-progress-fill-width CSS var, so no
 * separate countdown logic is needed here either.
 */
export function showToast(label, subject, options = {}) {
  // "error" gives the toast a red accent (matching the app's other error
  // affordances, e.g. RightPanel.jsx's save-status dot) instead of the
  // default green, so a failed save can never be mistaken for success.
  const isError = options.variant === "error";
  toaster.show((props) => (
    <Toast
      toastId={props.toastId}
      duration={options.linger ?? 2500}
      // bg-pane/border-pane-hover/shadow-card are theme tokens defined
      // with light-dark() in style.css, so the toast now follows the
      // user's color scheme instead of always rendering a light card.
      class={`flex flex-col gap-2 rounded-xl border border-pane-hover
        border-l-4 ${isError ? "border-l-[#cc0000]" : "border-l-[#2ca02c]"} bg-pane px-4 py-3 text-base text-text
        shadow-card
        transition-[opacity,transform] duration-200 data-[closed]:opacity-0
        data-[opened]:opacity-100 data-[closed]:translate-x-4
        data-[closed]:scale-95 data-[opened]:translate-x-0 data-[opened]:scale-100`}
    >
      <div class="flex items-baseline gap-2 text-sm">
        <span>{label}</span>
        {subject !== undefined && (
          <span class="font-normal tracking-wide text-text/85">{subject}</span>
        )}
      </div>
      <Toast.ProgressTrack class="h-1 w-full overflow-hidden rounded-full bg-pane-hover">
        <Toast.ProgressFill class="block h-full w-[var(--kb-toast-progress-fill-width)] rounded-full bg-brand transition-[width] duration-[250ms] ease-linear" />
      </Toast.ProgressTrack>
    </Toast>
  ));
}
