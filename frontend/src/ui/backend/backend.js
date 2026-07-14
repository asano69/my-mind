// src/ui/backend/backend.ts
import * as pubsub from "../../pubsub.js";
import * as app from "../../my-mind.js";
import * as io from "../io.js";
import MindMap from "../../map.js";
export default class BackendUI {
    constructor(backend, label) {
        this.backend = backend;
        this.label = label;
        this.mode = "load";
        repo.set(this.id, this);
        this.prefix = `mm.app.${this.id}`; // fixme k cemu?
        const { go, cancel } = this;
        cancel.addEventListener("click", _ => io.hide());
        go.addEventListener("click", _ => this.submit());
    }
    get id() { return this.backend.id; }
    get node() { return document.querySelector(`#${this.id}`); }
    get cancel() { return this.node.querySelector(".cancel"); }
    get go() { return this.node.querySelector(".go"); }
    get option() { return new Option(this.label, this.id); }
    reset() { this.backend.reset(); }
    setState(_data) { } // fixme any?
    getState() { return {}; }
    show(mode) {
        this.mode = mode;
        const { go, node } = this;
        go.textContent = mode.charAt(0).toUpperCase() + mode.substring(1);
        [...node.querySelectorAll("[data-for]")].forEach(node => node.hidden = true);
        [...node.querySelectorAll(`[data-for~=${mode}]`)].forEach(node => node.hidden = false);
        go.focus();
    }
    saveDone() {
        app.setThrobber(false);
        pubsub.publish("save-done", this);
    }
    loadDone(json) {
        app.setThrobber(false);
        try {
            app.showMap(MindMap.fromJSON(json));
            pubsub.publish("load-done", this);
        }
        catch (e) {
            this.error(e);
        }
    }
    error(e) {
        app.setThrobber(false);
        let message = (e instanceof Error ? e.message : e);
        alert(`IO error: ${message}`);
    }
    submit() {
        switch (this.mode) {
            case "save":
                this.save();
                break;
            case "load":
                this.load();
                break;
        }
    }
}
export let repo = new Map();
export function buildList(list, select) {
    let data = [];
    for (let id in list) {
        data.push({ id: id, name: list[id] });
    }
    data.sort((a, b) => a.name.localeCompare(b.name));
    let options = data.map(item => new Option(item.name, item.id));
    select.append(...options);
}
