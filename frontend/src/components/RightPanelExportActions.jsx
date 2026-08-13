import { createSignal, onMount } from "solid-js";
import { currentMapUuid, currentTitle } from "../lib/mindmap/store";
import { isNewEngineEnabled } from "../lib/mindmap/newEngineFlag";
import IconButton from "./IconButton";
import Images from "lucide-solid/icons/images";
import FileCode from "lucide-solid/icons/file-code";
import ImageDown from "lucide-solid/icons/image-down";

// Image/link export actions for the currently open map: copy as PNG,
// copy a Markdown image link to its server-rendered SVG, or download it
// as a PNG file. Split out of RightPanel.jsx since these are the
// panel's only concern that operates on the whole map rather than the
// selected item.
//
// Copy/download need to know which SVG node to render, which is
// engine-specific: the old engine keeps it on my-mind.js's live
// app.currentMap.node, while the new engine (?newEngine=1, now the
// default -- see newEngineFlag.js) registers it with newIo.js whenever
// NewMindMapPreview.jsx (re)loads a map (see that file's newIo.attach()
// call). backend/image.js's save()/download() both accept an explicit
// svgNode/name now (see that file), so this component resolves the
// right source per engine instead of letting ImageBackend silently fall
// back to app.currentMap, which is always null under the new engine.
export default function RightPanelExportActions() {
  const newEngine = isNewEngineEnabled();

  // Cached after the first dynamic import, see onMount.
  let commandRepo;
  let appModule;
  let imageModule;
  let newIoModule;

  const [ready, setReady] = createSignal(false);

  onMount(async () => {
    if (newEngine) {
      const [imageMod, newIoMod] = await Promise.all([
        import("../lib/mindmap/backend/image.js"),
        import("../lib/mindmap/newIo.js"),
      ]);
      imageModule = imageMod;
      newIoModule = newIoMod;
    } else {
      const [cmdMod, appMod, imageMod] = await Promise.all([
        import("../lib/mindmap/command/command.js"),
        import("../lib/mindmap/my-mind.js"),
        import("../lib/mindmap/backend/image.js"),
      ]);
      commandRepo = cmdMod.repo;
      appModule = appMod;
      imageModule = imageMod;
    }
    setReady(true);
  });

  // Runs the same "save-as" command used elsewhere (renders the map as a
  // transparent PNG and copies it to the system clipboard). Old engine
  // only -- command/command.js's copyMapImageToClipboard() reads
  // my-mind.js's app.currentMap directly, which the new engine never
  // sets, so the new engine gets its own copy below instead.
  function copyImage() {
    if (newEngine) {
      copyNewEngineImage();
      return;
    }
    commandRepo?.get("save-as").execute();
  }

  // New-engine equivalent of command/command.js's
  // copyMapImageToClipboard(), sourcing the SVG node from newIo.js
  // (registered by NewMindMapPreview.jsx) instead of app.currentMap.
  async function copyNewEngineImage() {
    const backend = new imageModule.default();
    const url = await backend.save("png", newIoModule.getSvgNode());
    if (navigator.clipboard?.write) {
      const res = await fetch(url);
      const blob = await res.blob();
      URL.revokeObjectURL(url);
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      const { showToast } = await import("../lib/mindmap/ui/toast.jsx");
      showToast("Mind map image copied to clipboard");
    } else {
      window.open(url, "_blank");
    }
  }

  // Renders the current map as a PNG and downloads it straight to disk,
  // reusing ImageBackend's existing save()/download() pair (see
  // backend/image.js) instead of duplicating its PNG-rendering logic.
  async function downloadImage() {
    if (newEngine) {
      const backend = new imageModule.default();
      const url = await backend.save("png", newIoModule.getSvgNode());
      backend.download(url, newIoModule.getRoot()?.name);
      URL.revokeObjectURL(url);
      return;
    }
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
        onClick={copyMarkdownLink}
        title="Copy markdown link"
        disabled={!currentMapUuid()}
      >
        <FileCode size={20} />
      </IconButton>

      <IconButton
        onClick={copyImage}
        title="Copy image (PNG)"
        disabled={!ready()}
      >
        <Images size={20} />
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
