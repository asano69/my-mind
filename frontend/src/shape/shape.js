const VERTICAL_OFFSET = 0.5;
export default class Shape {
    constructor(id, label) {
        this.id = id;
        this.label = label;
        repo.set(this.id, this);
    }
    get option() { return new Option(this.label, this.id); }
    update(item) {
        item.dom.content.style.borderColor = item.resolvedColor;
    }
    getHorizontalAnchor(item) {
        const { contentPosition, contentSize } = item;
        return Math.round(contentPosition[0] + contentSize[0] / 2) + 0.5;
    }
    getVerticalAnchor(item) {
        const { contentPosition, contentSize } = item;
        return contentPosition[1] + Math.round(contentSize[1] * VERTICAL_OFFSET) + 0.5;
    }
}
export const repo = new Map();
