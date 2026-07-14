// src/format/native.ts
import Format from "./format.js";
export default class Native extends Format {
    constructor() {
        super("native", "Native (JSON)");
        this.extension = "mymind";
        this.mime = "application/vnd.mymind+json";
    }
    to(data) {
        return JSON.stringify(data, null, "\t") + "\n";
    }
    from(data) {
        return JSON.parse(data);
    }
}
