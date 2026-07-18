import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
vi.mock("../command/command.js", () => ({
  repo: new Map([["insert-child", { isValid: true, execute }]]),
}));

const contextMenu = await import("./context-menu.js");

// Mirrors real DOM semantics closely enough for this test: capture-phase
// and bubble-phase listeners are tracked separately, and stopPropagation()
// halts further dispatch to either phase.
function eventTarget() {
  const capture = new Map();
  const bubble = new Map();
  return {
    addEventListener: vi.fn((type, listener, useCapture) => {
      const store = useCapture ? capture : bubble;
      if (!store.has(type)) store.set(type, []);
      store.get(type).push(listener);
    }),
    removeEventListener: vi.fn((type, listener, useCapture) => {
      const store = useCapture ? capture : bubble;
      const arr = store.get(type) || [];
      const i = arr.indexOf(listener);
      if (i > -1) arr.splice(i, 1);
    }),
    dispatchBubble(type, event) {
      for (const l of bubble.get(type) || []) {
        l(event);
        if (event.__stopped) return;
      }
    },
    querySelectorAll: vi.fn(() => []),
    style: {},
    hidden: true,
    offsetWidth: 0,
    offsetHeight: 0,
  };
}

function makeEvent(overrides = {}) {
  const e = {
    stopPropagation: vi.fn(() => {
      e.__stopped = true;
    }),
    preventDefault: vi.fn(),
    ...overrides,
  };
  return e;
}

describe("context menu click containment", () => {
  let node, port, docCapture;

  beforeEach(() => {
    execute.mockClear();
    node = eventTarget();
    port = eventTarget();
    docCapture = [];
    globalThis.document = {
      querySelector: vi.fn(() => node),
      addEventListener: vi.fn((type, listener, useCapture) => {
        if (type === "click" && useCapture) docCapture.push(listener);
      }),
      removeEventListener: vi.fn((type, listener, useCapture) => {
        if (type === "click" && useCapture) {
          const i = docCapture.indexOf(listener);
          if (i > -1) docCapture.splice(i, 1);
        }
      }),
    };
    contextMenu.init(port);
  });

  it("suppresses the click that follows a menu item's mousedown, so a delegated ancestor click listener never re-executes the command", () => {
    const button = { dataset: { command: "insert-child" } };

    // The menu item's mousedown runs the command immediately (existing
    // behavior).
    node.dispatchBubble(
      "mousedown",
      makeEvent({ currentTarget: node, target: button }),
    );
    expect(execute).toHaveBeenCalledOnce();

    // The browser's follow-up click reaches document's capture phase
    // before it would ever reach containerEl's bubble-phase delegated
    // listener (ui/ui.js). It must be stopped here, not re-execute.
    const clickEvent = makeEvent({ target: button });
    docCapture.forEach((l) => l(clickEvent));
    expect(clickEvent.stopPropagation).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce(); // still just once
  });

  it("does not suppress unrelated clicks (e.g. a mousedown outside the menu that only closes it)", () => {
    node.dispatchBubble(
      "mousedown",
      makeEvent({ currentTarget: port }), // currentTarget != node -> just close()
    );
    expect(execute).not.toHaveBeenCalled();

    const clickEvent = makeEvent({ target: {} });
    docCapture.forEach((l) => l(clickEvent));
    expect(clickEvent.stopPropagation).not.toHaveBeenCalled();
  });
});
