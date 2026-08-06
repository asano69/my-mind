import { render } from "solid-js/web";
import { Router, Route } from "@solidjs/router";
import { createSignal, onCleanup, Show } from "solid-js";
import Catalog from "./routes/Catalog";
import Workspace from "./routes/Workspace";

// Order matters: style.css defines the CSS custom properties every other
// stylesheet consumes via var().
import "./style.css";

import Login from "./routes/Login";
import ToastRegion from "./components/ToastRegion";

import pb from "./lib/pb";

// AuthGate blocks the whole app behind Login until a valid superuser
// session exists, tracking pb.authStore so it reacts immediately to
// both login and logout.
function AuthGate(props) {
  const [authed, setAuthed] = createSignal(pb.authStore.isValid);
  const unsubscribe = pb.authStore.onChange(() =>
    setAuthed(pb.authStore.isValid),
  );
  onCleanup(unsubscribe);

  return (
    <Show when={authed()} fallback={<Login />}>
      {props.children}
    </Show>
  );
}

render(
  () => (
    <>
      <AuthGate>
        <Router>
          <Route path="/" component={Catalog} />
          <Route path="/catalog" component={Catalog} />
          <Route path="/maps/new" component={Workspace} />
          <Route path="/maps/:uuid" component={Workspace} />
        </Router>
      </AuthGate>
      <ToastRegion />
    </>
  ),
  document.getElementById("app"),
);
