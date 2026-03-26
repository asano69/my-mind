import BackendUI from "./backend.js";
import WebDAV from "../../backend/webdav.js";
import * as app from "../../my-mind.js";
import { repo as formatRepo } from "../../format/format.js";

interface State {
	url: string;
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
		} catch (e) {
			this.error(e);
		}
	}
}
