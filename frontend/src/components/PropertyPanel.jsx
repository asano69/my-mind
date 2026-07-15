// The property panel (#ui) — layout/shape/value/status/color controls for
// the currently selected item, the notes/menu toggle buttons, the save
// spinner, and the save-status footer.
//
// Purely static markup: ui/*.js (layout.js, shape.js, value.js, status.js,
// color.js, text-color.js) query these elements by id/selector and wire
// them up once the mindmap engine boots.
export default function PropertyPanel() {
  return (
    <div id="ui" class="pane">
      <div class="scrollable">
        <p class="row">
          <button class="icon-btn" data-command="new" title="New">
            <img src="/icon/new.png" alt="New" />
          </button>
          <button class="icon-btn" data-command="load" title="Open">
            <img src="/icon/open.png" alt="Open" />
          </button>
          <button class="icon-btn" data-command="save" title="Save">
            <img src="/icon/save.png" alt="Save" />
          </button>
          <button class="icon-btn" data-command="save-as" title="Save as">
            <img src="/icon/save-as.png" alt="Save as" />
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
        <img src="/icon/notes.png" alt="Notes" />
      </button>
      <button class="icon-btn" id="toggle" data-command="ui" title="Toggle UI">
        <img src="/icon/menu.png" alt="Menu" />
      </button>
      <div class="spinner" hidden>
        <div class="dot1"></div>
        <div class="dot2"></div>
      </div>
    </div>
  );
}
