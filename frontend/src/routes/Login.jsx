import { createSignal } from "solid-js";
import { Button } from "@kobalte/core/button";
import pb from "../lib/pb";
import Logo from "../components/Logo";
// Login screen shown by AuthGate when no valid superuser session exists.
// This app is single-user, so the PocketBase superuser account also
// serves as the app's only login; there is no separate "users" collection.
export default function Login() {
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal("");
  const [pending, setPending] = createSignal(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      await pb.collection("_superusers").authWithPassword(email(), password());
      // No further action needed here: AuthGate subscribes to
      // pb.authStore.onChange and swaps this screen for the app once the
      // token is stored.
    } catch {
      setError("Invalid email or password.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div class="flex min-h-screen w-full items-center justify-center bg-bg px-6 text-text">
      <form
        onSubmit={handleSubmit}
        class="flex w-full max-w-sm flex-col gap-4 rounded-md border border-pane-hover bg-pane p-8 shadow-card"
      >
        <div class="flex justify-center">
          <Logo size={48} showTitle centerTitle />
        </div>

        <input
          type="email"
          placeholder="Email"
          value={email()}
          onInput={(e) => setEmail(e.target.value)}
          required
          autofocus
          class="rounded-md border border-pane-hover bg-bg px-3 py-2 text-text"
        />
        <input
          type="password"
          placeholder="Password"
          value={password()}
          onInput={(e) => setPassword(e.target.value)}
          required
          class="rounded-md border border-pane-hover bg-bg px-3 py-2 text-text"
        />
        {error() && <p class="text-sm text-[#dc3545]">{error()}</p>}
        {/* Kobalte's Button owns disabled semantics (aria-disabled,
            blocking clicks while disabled) instead of relying only on
            the native disabled attribute, matching the rest of the
            app's Kobalte-based controls (Switch, Select, Dialog). */}
        <Button
          type="submit"
          disabled={pending()}
          class="rounded-md bg-[#5563A2]/70 px-3 py-2 text-sm font-semibold
            text-white transition-colors hover:bg-[#5563A2]/85
            focus-visible:outline focus-visible:outline-2
            focus-visible:outline-offset-2 focus-visible:outline-accent
            disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending() ? "Logging in…" : "Log in"}
        </Button>
      </form>
    </div>
  );
}
