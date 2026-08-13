import { describe, expect, it } from "vitest";

import { isNewEngineEnabled } from "./newEngineFlag.js";

describe("isNewEngineEnabled", () => {
  it("returns true (new engine) for any query string other than exactly oldEngine=1", () => {
    expect(isNewEngineEnabled("")).toBe(true);
    expect(isNewEngineEnabled("?foo=bar")).toBe(true);
    expect(isNewEngineEnabled("?oldEngine=0")).toBe(true);
    expect(isNewEngineEnabled("?oldEngine=true")).toBe(true);
  });

  it("returns false (legacy engine) only for ?oldEngine=1", () => {
    expect(isNewEngineEnabled("?oldEngine=1")).toBe(false);
    expect(isNewEngineEnabled("?foo=bar&oldEngine=1")).toBe(false);
  });
});
