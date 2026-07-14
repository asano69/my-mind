// src/backend/backend.ts
export default class Backend {
  constructor(id) {
    this.id = id;
    repo.set(id, this);
  }
  reset() {}
}
export let repo = new Map();
