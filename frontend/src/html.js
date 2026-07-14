// src/html.ts
export function node(name, attrs) {
    let node = document.createElement(name);
    Object.assign(node, attrs);
    return node;
}
