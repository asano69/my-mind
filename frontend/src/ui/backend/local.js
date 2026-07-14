// src/ui/backend/local.ts
import * as app from "../../my-mind.js";
import BackendUI, { buildList } from "./backend.js";
import Local from "../../backend/local.js";
import { repo as formatRepo } from "../../format/format.js";
export default class LocalUI extends BackendUI {
    constructor() {
        super(new Local(), "Browser storage");
        this.remove.addEventListener("click", _ => {
            var id = this.list.value;
            if (!id) {
                return;
            }
            this.backend.remove(id);
            this.show(this.mode);
        });
    }
    get list() { return this.node.querySelector(".list"); }
    get remove() { return this.node.querySelector(".remove"); }
    show(mode) {
        super.show(mode);
        const { go, remove, list } = this;
        go.disabled = false;
        if (mode == "load") {
            let stored = this.backend.list();
            list.innerHTML = "";
            if (Object.keys(stored).length) {
                go.disabled = false;
                remove.disabled = false;
                buildList(stored, this.list);
            }
            else {
                this.go.disabled = true;
                this.remove.disabled = true;
                let o = document.createElement("option");
                o.innerHTML = "(no maps saved)";
                this.list.append(o);
            }
        }
    }
    setState(data) {
        this.load(data.id);
    }
    getState() {
        let data = {
            b: this.id,
            id: app.currentMap.id
        };
        return data;
    }
    save() {
        let json = app.currentMap.toJSON();
        let data = formatRepo.get("native").to(json);
        try {
            this.backend.save(data, app.currentMap.id, app.currentMap.name);
            this.saveDone();
        }
        catch (e) {
            this.error(e);
        }
    }
    load(id = this.list.value) {
        try {
            let data = this.backend.load(id);
            var json = formatRepo.get("native").from(data);
            this.loadDone(json);
        }
        catch (e) {
            this.error(e);
        }
    }
}
