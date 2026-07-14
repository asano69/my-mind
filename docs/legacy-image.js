// src/ui/backend/image.ts
import BackendUI from "./backend.js";
import Image from "../../backend/image.js";
export default class ImageUI extends BackendUI {
    constructor() {
        super(new Image(), "Image");
    }
    get format() { return this.node.querySelector(".format"); }
    async save() {
        let url = await this.backend.save(this.format.value);
        this.backend.download(url);
    }
    load() { }
}
