import BackendUI from "./backend.js";
import WebDAV from "../../backend/webdav.js";
import * as app from "../../my-mind.js";
import { repo as formatRepo } from "../../format/format.js";

interface State {
	url: string;
}

function showToast(message: string) {
    const el = document.createElement("div");
    el.textContent = message;
    el.style.cssText = `
        position: fixed;
        bottom: 2rem;
        left: 50%;
        transform: translateX(-50%);
        background: #333;
        color: #fff;
        padding: 0.6rem 1.2rem;
        border-radius: 4px;
        font-size: 0.9rem;
        opacity: 1;
        transition: opacity 1s ease 2s;
        z-index: 9999;
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => {
        el.style.opacity = "0";
        el.addEventListener("transitionend", () => el.remove());
    });
}

export default class WebDAVUI extends BackendUI<WebDAV> {
	protected current = "";

	constructor() {
		super(new WebDAV(), "Generic WebDAV");

		this.url.value = localStorage.getItem(`${this.prefix}.url`) || "";
	}


	get url() { return this.node.querySelector<HTMLInputElement>(".url")!; }

	getState(): State {
		if (!this.current) return { url: "" };
		const base = this.url.value
			? (this.url.value.endsWith("/") ? this.url.value : this.url.value + "/")
			: null;
		const relative = base && this.current.startsWith(base)
			? this.current.slice(base.length)
			: this.current;
		return { url: relative };
	}

  setState(data: State) {
      if (!data.url) return;
      const isAbsolute = /^https?:\/\//.test(data.url);
      if (isAbsolute) {
          this.load(data.url);
          return;
      }
      // 相対パス：ベースURLを決定する
      const base = this.url.value || (() => {
          const { protocol, host } = window.location;
          return `${protocol}//${host}/maps`;
      })();
      const fullUrl = (base.endsWith("/") ? base : base + "/") + data.url;
      this.load(fullUrl);
  }
	async save() {
		app.setThrobber(true);
		var map = app.currentMap;
		var url = this.url.value;
		localStorage.setItem(`${this.prefix}.url`, url);
		if (url.match(/\.mymind$/)) { // complete file name
		} else { // just a path
			if (url.charAt(url.length-1) != "/") { url += "/"; }
			url += `${map.name}.${formatRepo.get("native")!.extension}`;
		}
		this.current = url;
		let json = map.toJSON();
		let data = formatRepo.get("native")!.to(json);
		try {
			await this.backend.save(data, url);
			this.saveDone();
		} catch (e) {
			this.error(e);
		}
	}

  async load(url = this.url.value) {
        this.current = url;
        app.setThrobber(true);
        var lastIndex = url.lastIndexOf("/");
        this.url.value = url.substring(0, lastIndex);
        localStorage.setItem(`${this.prefix}.url`, this.url.value);
        try {
            let data = await this.backend.load(url);
            let json = formatRepo.get("native")!.from(data);
            this.loadDone(json);
        } catch (e: any) {
            if (e && e.status === 404) {
                const filename = url.split("/").pop()!.replace(/\.mymind$/, "");
                const id = Math.random().toString(36).slice(2, 10).replace(/[0-9]/g, c =>
                            String.fromCharCode(97 + parseInt(c)));
                const emptyJson = {
                    root: {
                        id,
                        text: filename,
                        notes: "",
                        layout: "map"
                    }
                };
                showToast(`New Map: ${filename}.mymind`);
                this.loadDone(emptyJson);
            } else {
                this.error(e);
            }
        }
    }
}
