// The keyboard-shortcut help panel (#help). The tables start empty —
// ui/help.js populates each one from the command repo once the mindmap
// engine boots, so the class names here must match what it queries for.
export default function HelpPanel() {
  return (
    <div id="help" class="pane" hidden>
      <h3>Help</h3>
      <p>Navigation</p>
      <table class="navigation"></table>
      <p>Manipulation</p>
      <table class="manipulation"></table>
      <p>Editing</p>
      <table class="editing"></table>
      <p>Other</p>
      <table class="other"></table>
    </div>
  );
}
