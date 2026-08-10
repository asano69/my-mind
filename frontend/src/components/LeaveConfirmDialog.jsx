import ConfirmDialog from "./ConfirmDialog";
import { leaveConfirmOpen, resolveLeaveConfirm } from "../lib/mindmap/store";

// Confirmation shown by io.js's confirmLeave() before navigating away
// from a map that has never been saved (no uuid) and either auto-save
// is off or the save itself failed -- without this, switching maps,
// starting a new one, or going to the catalog would silently discard
// the current map. Always mounted (see MindMapCanvas.jsx), same as
// ErrorDialog.
export default function LeaveConfirmDialog() {
  return (
    <ConfirmDialog
      open={leaveConfirmOpen()}
      onOpenChange={(open) => !open && resolveLeaveConfirm(false)}
      title="Leave without saving?"
      description="This map has never been saved and auto-save is off. Leaving now will discard it."
      confirmLabel="Discard"
      onConfirm={() => resolveLeaveConfirm(true)}
    />
  );
}
