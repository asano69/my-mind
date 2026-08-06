import { Toast } from "@kobalte/core/toast";

// Mounts Kobalte's toast viewport once for the whole app. Actual toasts
// are triggered from plain JS modules (e.g. command/command.js) via
// toast.js's showToast(), which calls the toaster singleton -- this
// component only owns where they render. Bottom-right placement, stacking
// upward, matching common toast conventions.
export default function ToastRegion() {
  return (
    <Toast.Region duration={2500} swipeDirection="right">
      <Toast.List
        class="fixed right-[1.2rem] bottom-[1.2rem] z-[9999] flex w-[320px]
          max-w-[calc(100vw-2.4rem)] flex-col items-stretch gap-2"
      />
    </Toast.Region>
  );
}
