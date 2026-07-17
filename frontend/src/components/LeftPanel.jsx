import { leftPanelHidden } from "../lib/mindmap/store";

// The left sidebar, symmetric to the right-hand property panel (#ui,
// see RightPanel.jsx — to be renamed RightPanel.jsx). Empty for now;
// will eventually list this map's snapshots so the user can restore one.
export default function LeftPanel() {
  return <div id="left-panel" class="pane pane-left" hidden={leftPanelHidden()} />;
}
