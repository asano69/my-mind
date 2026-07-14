// src/backend/file.ts
import Backend from "./backend.js";
export default class File extends Backend {
    constructor() {
        super("file");
        this.input = document.createElement("input");
    }
    save(data, name) {
        let link = document.createElement("a");
        link.download = name;
        link.href = "data:text/plain;base64," + btoa(unescape(encodeURIComponent(data)));
        document.body.append(link);
        link.click();
        link.remove();
    }
    load() {
        const { input } = this;
        input.type = "file";
        return new Promise((resolve, reject) => {
            input.onchange = _ => {
                let file = input.files[0];
                if (!file) {
                    return;
                }
                var reader = new FileReader();
                reader.onload = function () { resolve({ data: reader.result, name: file.name }); };
                reader.onerror = function () { reject(reader.error); };
                reader.readAsText(file);
            };
            input.click();
        });
    }
}
