export default class Format {
    constructor(id, label) {
        this.id = id;
        this.label = label;
        repo.set(id, this);
    }
    get option() { return new Option(this.label, this.id); }
}
export let repo = new Map();
function getByProperty(property, value) {
    let filtered = [...repo.values()].filter(format => format[property] == value);
    return (filtered[0] || null);
}
export function getByName(name) {
    let index = name.lastIndexOf(".");
    if (index == -1) {
        return null;
    }
    let extension = name.substring(index + 1).toLowerCase();
    return getByProperty("extension", extension);
}
export function getByMime(mime) {
    return getByProperty("mime", mime);
}
export function nl2br(str) {
    return str.replace(/\n/g, "<br/>");
}
export function br2nl(str) {
    return str.replace(/<br\s*\/?>/g, "\n");
}
