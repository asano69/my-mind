// src/backend/local.ts
import Backend from "./backend.js";
export default class Local extends Backend {
    constructor() {
        super("local");
        this.prefix = "mm.map";
    }
    save(data, id, name) {
        localStorage.setItem(`${this.prefix}.${id}`, data);
        let names = this.list();
        names[id] = name;
        localStorage.setItem(`${this.prefix}.names`, JSON.stringify(names));
    }
    load(id) {
        let data = localStorage.getItem(`${this.prefix}.${id}`);
        if (!data) {
            throw new Error("There is no such saved map");
        }
        return data;
    }
    remove(id) {
        localStorage.removeItem(`${this.prefix}.${id}`);
        let names = this.list();
        delete names[id];
        localStorage.setItem(`${this.prefix}.names`, JSON.stringify(names));
    }
    list() {
        try {
            let data = localStorage.getItem(`${this.prefix}.names`) || "{}";
            return JSON.parse(data);
        }
        catch (e) {
            return {};
        }
    }
}
