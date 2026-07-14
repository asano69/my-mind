// src/svg.ts
const NS = "http://www.w3.org/2000/svg";
export function node(name, attrs) {
  let node = document.createElementNS(NS, name);
  for (let attr in attrs) {
    node.setAttribute(attr, attrs[attr]);
  }
  return node;
}
export function group() {
  return node("g");
}
export function foreignObject() {
  let fo = node("foreignObject");
  // firefox needs dimensions. without them, the inner HTML content would have weird metrics
  fo.setAttribute("width", "1");
  fo.setAttribute("height", "1");
  return fo;
}
