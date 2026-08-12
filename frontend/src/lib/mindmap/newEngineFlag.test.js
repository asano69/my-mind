import { describe, expect, it } from "vitest";

import { isNewEngineEnabled } from "./newEngineFlag.js";

describe("isNewEngineEnabled", () => {
  it("enables the parallel Solid ItemNode renderer only for ?newEngine=1", () => {
    expect(isNewEngineEnabled("?newEngine=1")).toBe(true);
    expect(isNewEngineEnabled("?foo=bar&newEngine=1")).toBe(true);
    expect(isNewEngineEnabled("?newEngine=0")).toBe(false);
    expect(isNewEngineEnabled("?newEngine=true")).toBe(false);
    expect(isNewEngineEnabled("")).toBe(false);
  });
});
