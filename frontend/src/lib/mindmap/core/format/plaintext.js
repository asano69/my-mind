// src/format/plaintext.ts
import Format from "./format.js";
export default class Plaintext extends Format {
  constructor() {
    super("plaintext", "Plain text");
    this.extension = "txt";
    this.mime = "application/vnd.mymind+txt";
  }
  to(data) {
    return serializeItem("root" in data ? data.root : data);
  }
  from(data) {
    var lines = data.split("\n").filter(function (line) {
      return line.match(/\S/);
    });
    var items = parseItems(lines);
    let result;
    if (items.length == 1) {
      result = {
        root: items[0],
      };
    } else {
      result = {
        root: {
          text: "",
          children: items,
        },
      };
    }
    result.root.layout = "map";
    return result;
  }
}
function serializeItem(item, depth = 0) {
  var lines = (item.children || []).map((child) => {
    return serializeItem(child, depth + 1);
  });
  var prefix = new Array(depth + 1).join("\t");
  lines.unshift(prefix + item.text.replace(/\n/g, ""));
  return lines.join("\n") + (depth ? "" : "\n");
}
function parseItems(lines) {
  let items = [];
  if (!lines.length) {
    return items;
  }
  var firstPrefix = parsePrefix(lines[0]);
  let currentItem = null;
  let childLines = [];
  /* finalize a block of sub-children by converting them to items and appending */
  var convertChildLinesToChildren = function () {
    if (!currentItem || !childLines.length) {
      return;
    }
    var children = parseItems(childLines);
    if (children.length) {
      currentItem.children = children;
    }
    childLines = [];
  };
  lines.forEach((line) => {
    if (parsePrefix(line) == firstPrefix) {
      /* new top-level item! */
      convertChildLinesToChildren(); /* finalize previous item */
      currentItem = { text: line.match(/^\s*(.*)/)[1] };
      items.push(currentItem);
    } else {
      /* prepare as a future child */
      childLines.push(line);
    }
  });
  convertChildLinesToChildren();
  return items;
}
function parsePrefix(line) {
  return line.match(/^\s*/)[0];
}

new Plaintext();
