// The save confirmation panel (#io). Its buttons and Escape handling are
// wired up by ui/io.js once the mindmap engine boots.
export default function SaveDialog() {
  return (
    <div id="io" class="pane" hidden>
      <h3>Save</h3>
      <p class="row">
        <button class="go">Save</button>
        <button class="cancel">Cancel</button>
      </p>
    </div>
  );
}
