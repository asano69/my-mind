// src/backend/webdav.ts
import Backend from "./backend.js";
export default class WebDAV extends Backend {
    constructor() { super("webdav"); }
    save(data, url) {
        return this.request("PUT", url, data);
    }
    load(url) {
        return this.request("GET", url);
    }
    async request(method, url, data) {
        let init = {
            method,
            credentials: "include"
        };
        if (data) {
            init.body = data;
        }
        let response = await fetch(url, init);
        let text = await response.text();
        if (response.ok) {
            return text;
        }
        else {
            throw { status: response.status, text }; // ← statusを含むオブジェクトをthrow
        }
    }
}
