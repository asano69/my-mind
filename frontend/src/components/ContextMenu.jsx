// The right-click item menu (#context-menu). Button labels are filled in
// and click handling is wired up by ui/context-menu.js once the mindmap
// engine boots.
export default function ContextMenu() {
  return (
    <div id="context-menu" hidden>
      <button data-command="notes"></button>
      <span></span>
      <button data-command="insert-child"></button>
      <button data-command="insert-sibling"></button>
      <button data-command="delete"></button>
      <span></span>
      <button data-command="edit"></button>
      <button data-command="value"></button>
      <span></span>
      <button data-command="undo"></button>
      <button data-command="redo"></button>
      <button data-command="center"></button>
    </div>
  );
}
