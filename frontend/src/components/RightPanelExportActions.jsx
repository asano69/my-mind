import { createSignal, onMount } from "solid-js";
import { currentMapUuid, currentTitle } from "../lib/mindmap/store";
import IconButton from "./IconButton";
import Images from "lucide-solid/icons/images";
import FileCode from "lucide-solid/icons/file-code";
import ImageDown from "lucide-solid/icons/image-down";

// Image/link export actions for the currently open map: copy as PNG,
// copy a Markdown image link to its server-rendered SVG, or download it
// as a PNG file. Split out of RightPanel.jsx since these are the
// panel's only concern that operates on the whole map rather than the
// selected item.
export default function RightPanelExportActions() {
  // Cached after the first dynamic import, see onMount.
  let commandRepo;
  let appModule;
  let imageModule;

  const [ready, setReady] = createSignal(false);

  onMount(async () => {
    const [cmdMod, appMod, imageMod] = await Promise.all([
      import("../lib/mindmap/command/command.js"),
      import("../lib/mindmap/my-mind.js"),
      import("../lib/mindmap/backend/image.js"),
    ]);
    commandRepo = cmdMod.repo;
    appModule = appMod;
    imageModule = imageMod;
    setReady(true);
  });

  // Runs the same "save-as" command used elsewhere (renders the map as a
  // transparent PNG and copies it to the system clipboard).
  function copyImage() {
    commandRepo?.get("save-as").execute();
  }

  // Renders the current map as a PNG and downloads it straight to disk,
  // reusing ImageBackend's existing save()/download() pair (see
  // backend/image.js) instead of duplicating its PNG-rendering logic.
  async function downloadImage() {
    appModule.setThrobber(true);
    try {
      const backend = new imageModule.default();
      const url = await backend.save("png");
      backend.download(url);
      URL.revokeObjectURL(url);
    } finally {
      appModule.setThrobber(false);
    }
  }

  // Copies a Markdown image-embed pointing at this map's server-rendered
  // SVG thumbnail (see internal/cmd/serve/serve.go's "/maps/{uuid}/svg"
  // route), so pasting into a Markdown document embeds a live snapshot
  // instead of a static file. Disabled until the map has been saved at
  // least once -- currentMapUuid() is null for a brand-new, unsaved map,
  // and there is no stable URL to point at yet.
  async function copyMarkdownLink() {
    const uuid = currentMapUuid();
    if (!uuid) {
      return;
    }
    const title = currentTitle() || "Untitled";
    const url = `${window.location.origin}/maps/${uuid}/svg`;
    await navigator.clipboard.writeText(`![${title}](${url})`);
    const { showToast } = await import("../lib/mindmap/ui/toast.jsx");
    showToast("Markdown link copied to clipboard");
  }

  return (
    <div class="flex border-b  border-black/10 gap-1 px-4">
      <IconButton
        onClick={copyImage}
        title="Copy image (PNG)"
        disabled={!ready()}
      >
        <Images size={20} />
      </IconButton>

      <IconButton
        onClick={copyMarkdownLink}
        title="Copy markdown link"
        disabled={!currentMapUuid()}
      >
        <FileCode size={20} />
      </IconButton>
      <IconButton
        onClick={downloadImage}
        title="ImageDown image (PNG)"
        disabled={!ready()}
      >
        <ImageDown size={20} />
      </IconButton>
    </div>
  );
}
