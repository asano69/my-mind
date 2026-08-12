export function isNewEngineEnabled(search = globalThis.location?.search ?? "") {
  return new URLSearchParams(search).get("newEngine") === "1";
}
