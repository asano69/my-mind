import { describe, expect, it } from "vitest";
import { isUrlOnly } from "./urlUtils.js";

describe("isUrlOnly", () => {
  it("matches a string that is entirely an http(s) URL", () => {
    expect(isUrlOnly("https://example.com")).toBe(true);
    expect(isUrlOnly("  http://example.com/path  ")).toBe(true);
  });

  it("rejects a URL embedded in other text", () => {
    expect(isUrlOnly("see https://example.com here")).toBe(false);
  });

  it("rejects a non-URL string", () => {
    expect(isUrlOnly("hello world")).toBe(false);
  });
});
