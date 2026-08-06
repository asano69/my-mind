import { Toast, toaster } from "@kobalte/core/toast";

/* Toast notification utility, backed by Kobalte's Toast primitive (see
 * components/ToastRegion.jsx for the mounted viewport). Usage unchanged
 * from callers' perspective:
 *   import { showToast } from "./toast.jsx";
 *   showToast("Saved", "my-map");   // label + subject
 *   showToast("Done!");             // plain message (subject omitted)
 *
 * Kobalte owns entrance/exit animation, stacking, and the auto-dismiss
 * timer (options.linger maps to its `duration` prop), so none of that
 * needs to be reimplemented here.
 */
export function showToast(label, subject, options = {}) {
  toaster.show((props) => (
    <Toast
      toastId={props.toastId}
      duration={options.linger ?? 2500}
      class="flex items-baseline gap-2 rounded-lg bg-pane-hover px-4 py-2
        text-base text-text shadow-card transition-[opacity,transform]
        duration-200 data-[closed]:opacity-0 data-[opened]:opacity-100
        data-[closed]:translate-y-1 data-[opened]:translate-y-0"
    >
      <span>{label}</span>
      {subject !== undefined && (
        <span class="font-normal tracking-wide text-text/85">{subject}</span>
      )}
    </Toast>
  ));
}
