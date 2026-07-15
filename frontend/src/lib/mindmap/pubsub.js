let subscribers = new Map();
export function publish(message, publisher, data) {
  let subs = subscribers.get(message) || [];
  subs.forEach((sub) => {
    if (typeof sub == "function") {
      sub(message, publisher, data);
    } else {
      sub.handleMessage(message, publisher, data);
    }
  });
}
export function subscribe(message, subscriber) {
  if (!subscribers.has(message)) {
    subscribers.set(message, []);
  }
  let subs = subscribers.get(message) || [];
  let index = subs.indexOf(subscriber);
  if (index == -1) {
    subs.push(subscriber);
  }
}
export function unsubscribe(message, subscriber) {
  let subs = subscribers.get(message) || [];
  let index = subs.indexOf(subscriber);
  if (index > -1) {
    subs.splice(index, 1);
  }
}
// Clears every subscription across all messages. Called once by
// my-mind.js's unmount() so that a subsequent mount() can freely
// re-subscribe without piling up duplicate handlers from the previous
// mount (see CLAUDE.md, "my-mind.js アンマウント安全化").
export function reset() {
  subscribers.clear();
}
