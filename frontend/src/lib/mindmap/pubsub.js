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
