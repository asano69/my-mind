import { useNavigate } from "@solidjs/router";

import TitleBar from "./TitleBar";
// icons
import Trash2 from "lucide-solid/icons/trash-2";
import TextCursor from "lucide-solid/icons/text-cursor";
// The floating strip across the top of the canvas: the title input
// (fixed top-center, rendered by TitleBar) and the right-hand icon
// group (delete/notes/property-panel toggle). Catalog/Help/the left
// panel toggle used to live here too, but moved to LeftPanel.jsx's
// permanent vertical ribbon so they stay visible even when the left
// panel is collapsed (see LeftPanel.jsx).
export default function TopBar() {
  const navigate = useNavigate();

  // Deletes the currently open map (same backend call as Catalog.jsx's
  // delete button) and returns to the catalog afterwards.
  async function handleDelete() {
    if (!confirm("Delete this map?")) {
      return;
    }
    const io = await import("../lib/mindmap/ui/io.js");
    await io.deleteCurrentMap();
    navigate("/catalog");
  }

  return (
    <>
      <TitleBar />
      <div class="topbar-right">
        <button class="icon-btn" title="Delete map" onClick={handleDelete}>
          <Trash2 size={28} />
        </button>
         <button class="icon-btn" data-command="notes" title="Notes">
          <TextCursor size={28} />
        </button>
      </div>
    </>
  );
}
