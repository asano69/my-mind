import { beforeEach, describe, expect, it, vi } from "vitest";

// context-menu.js is now a thin wrapper around store.js's
// contextMenuPoint signal (see ContextMenu.jsx, which renders the actual
// menu and handles clicks). These tests just confirm open()/close()/
// init()/dispose() write the expected value -- rendering, positioning,
// and click handling now live in ContextMenu.jsx itself.
vi.mock("../store.js", () => ({ setContextMenuPoint: vi.fn() }));

const contextMenu = await import("./context-menu.js");
const { setContextMenuPoint } = await import("../store.js");

describe("context-menu.js", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("open() stores the click point", () => {
    contextMenu.open([120, 80]);
    expect(setContextMenuPoint).toHaveBeenCalledWith({ x: 120, y: 80 });
  });

  it("close() clears the point", () => {
    contextMenu.close();
    expect(setContextMenuPoint).toHaveBeenCalledWith(null);
  });

  it("init() closes any stale menu from a previous mount", () => {
    contextMenu.init();
    expect(setContextMenuPoint).toHaveBeenCalledWith(null);
  });

  it("dispose() closes the menu", () => {
    contextMenu.dispose();
    expect(setContextMenuPoint).toHaveBeenCalledWith(null);
  });
});
