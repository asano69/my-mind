import { onMount } from "solid-js";

// Renders the exact DOM structure the legacy mind-map engine expects
// (#ui, #io, #help, #notes, #context-menu, #help-btn, and the <main>
// element the engine mounts the SVG map into). The engine itself is
// imported dynamically inside onMount so its module-level
// `document.querySelector(...)` calls run only after this markup is
// actually attached to the real DOM.
export default function MindMapCanvas() {
  onMount(() => {
    import("../lib/mindmap/my-mind.js");
  });

  return (
    <>
      <main>
        <button
          id="catalog-link"
          class="icon-btn"
          data-command="go-to-catalog"
          title="Catalog"
        >
          <img src="img/catalog.png" alt="Catalog" />
        </button>
      </main>

      <div id="ui" class="pane">
        <div class="scrollable">
          <p class="row">
            <button class="icon-btn" data-command="new" title="New">
              <img src="img/new.png" alt="New" />
            </button>
            <button class="icon-btn" data-command="load" title="Open">
              <img src="img/open.png" alt="Open" />
            </button>
            <button class="icon-btn" data-command="save" title="Save">
              <img src="img/save.png" alt="Save" />
            </button>
            <button class="icon-btn" data-command="save-as" title="Save as">
              <img src="img/save-as.png" alt="Save as" />
            </button>
          </p>
          <p>
            <label>
              <span>Layout</span>
              <select id="layout">
                <option value="">(Inherit)</option>
              </select>
            </label>
          </p>
          <p>
            <label>
              <span>Shape</span>
              <select id="shape">
                <option value="">(Automatic)</option>
              </select>
            </label>
          </p>
          <p>
            <label>
              <span>Value</span>
              <select id="value">
                <option value="">(None)</option>
                <option value="num">Number</option>
                <optgroup label="Formula">
                  <option value="sum">Sum</option>
                  <option value="avg">Average</option>
                  <option value="min">Minimum</option>
                  <option value="max">Maximum</option>
                </optgroup>
              </select>
            </label>
          </p>
          <p>
            <label>
              <span>Status</span>
              <select id="status">
                <option value="">None</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
                <option value="computed">Autocompute</option>
              </select>
            </label>
          </p>
          <p>
            <label>
              <span>Item color</span>
              <span id="color" class="color-picker">
                <a data-color="" title="Inherit" href="#"></a>
                <a data-color="#000" title="Black" href="#"></a>
                <a data-color="#d33" title="Red" href="#"></a>
                <a data-color="#33d" title="Blue" href="#"></a>
                <a data-color="#3d3" title="Green" href="#"></a>
                <a data-color="#d3d" title="Magenta" href="#"></a>
                <a data-color="#3dd" title="Cyan" href="#"></a>
                <a data-color="#dd3" title="Yellow" href="#"></a>
              </span>
            </label>
          </p>
          <p>
            <label>
              <span>Text color</span>
              <span id="text-color" class="color-picker">
                <a data-color="" title="Inherit" href="#"></a>
                <a data-color="#000" title="Black" href="#"></a>
                <a data-color="#d33" title="Red" href="#"></a>
                <a data-color="#33d" title="Blue" href="#"></a>
                <a data-color="#3d3" title="Green" href="#"></a>
                <a data-color="#d3d" title="Magenta" href="#"></a>
                <a data-color="#3dd" title="Cyan" href="#"></a>
                <a data-color="#dd3" title="Yellow" href="#"></a>
              </span>
            </label>
          </p>
        </div>
        <footer>
          <span id="save-status"></span>
        </footer>

        <button class="icon-btn" data-command="notes" title="Notes">
          <img src="img/notes.png" alt="Notes" />
        </button>
        <button
          class="icon-btn"
          id="toggle"
          data-command="ui"
          title="Toggle UI"
        >
          <img src="img/menu.png" alt="Menu" />
        </button>
        <div class="spinner" hidden>
          <div class="dot1"></div>
          <div class="dot2"></div>
        </div>
      </div>

      <div id="io" class="pane" hidden>
        <h3>Save</h3>
        <p>
          <label>
            <span>Name</span>
            <input type="text" class="name" placeholder="my map" />
          </label>
        </p>
        <p class="row">
          <button class="go">Save</button>
          <button class="cancel">Cancel</button>
        </p>
      </div>

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

      <div id="notes" class="pane" hidden>
        <iframe
          sandbox="allow-scripts allow-same-origin allow-popups"
          src="editor.html"
        ></iframe>
      </div>

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

      <button id="help-btn" class="icon-btn" data-command="help" title="Help">
        <img src="img/help.png" alt="Help" />
      </button>
    </>
  );
}
