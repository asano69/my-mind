import { Toast } from "@kobalte/core/toast";

// Mounts Kobalte's toast viewport once for the whole app. Actual toasts
// are triggered from plain JS modules (e.g. command/command.js) via
// toast.js's showToast(), which calls the toaster singleton -- this
// component only owns where they render. Bottom-center placement
// matches the old hand-rolled toast.js's positioning.
export default function ToastRegion() {
  return (
    <Toast.Region duration={2500} swipeDirection="down">
      <Toast.List
        class="fixed bottom-[1.2rem] left-1/2 z-[9999] flex -translate-x-1/2
          flex-col items-center gap-2"
      />
    </Toast.Region>
  );
}
