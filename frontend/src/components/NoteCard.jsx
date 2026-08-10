// A single note's card on the Home page: label, countdown to the next
// occurrence, and the shift/edit actions. Split out of Home.jsx so the
// list container and the card rendering can be maintained independently.
import { createSignal, createMemo, onMount, onCleanup, Show } from "solid-js";
import { A } from "@solidjs/router";
import { Tooltip } from "@kobalte/core/tooltip";
import Hourglass from "lucide-solid/icons/hourglass";
import { utcToLocal, formatNaive } from "../lib/tz";
import { nextOccurrenceUtcString } from "../lib/rrule";
import { formatRemaining } from "../lib/noteSchedule";

export default function NoteCard(props) {
  const [now, setNow] = createSignal(Date.now());
  onMount(() => {
    const intervalId = setInterval(() => setNow(Date.now()), 60000);
    onCleanup(() => clearInterval(intervalId));
  });

  const nextUtc = createMemo(() => {
    now();
    return nextOccurrenceUtcString(props.note.dtstart, props.note.rrule);
  });
  const remaining = createMemo(() => formatRemaining(nextUtc(), now()));

  return (
    <li class="flex items-start gap-3 rounded-md border border-[var(--color-border-soft)] bg-[var(--color-field)] p-4 shadow-[0_1px_3px_0_var(--color-shadow)]">
      <div class="flex flex-1 flex-col gap-2">
        <div>
          <div class="flex items-baseline justify-between gap-2">
            {/* Description shows as a tooltip on hover/focus of the title;
                notes without a description just render a plain h2. */}
            <Show
              when={props.note.description}
              fallback={<h2 class="font-serif text-xl">{props.note.label}</h2>}
            >
              <Tooltip>
                <Tooltip.Trigger
                  as="h2"
                  tabIndex={0}
                  class="cursor-default font-serif text-xl focus:outline-none"
                >
                  {props.note.label}
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content class="max-w-xs rounded-md border border-[var(--color-border-soft)] bg-[var(--color-field)] px-3 py-2 text-sm text-[var(--color-text)] shadow-[0_1px_3px_0_var(--color-shadow)]">
                    <Tooltip.Arrow />
                    {props.note.description}
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip>
            </Show>
            {remaining() && (
              <span class="flex items-center gap-1 whitespace-nowrap font-serif text-xl">
                <Hourglass class="h-4 w-4 transition-transform duration-500 hover:rotate-[360deg]" />
                {remaining()}
              </span>
            )}
          </div>

          <div class="mt-1 flex flex-col gap-0.5 font-mono text-xs text-[var(--color-border-soft)]">
            <span>
              Next: {formatNaive(utcToLocal(nextUtc(), props.tz)) || "—"}
            </span>
            <span>
              Base: {formatNaive(utcToLocal(props.note.dtstart, props.tz))}
            </span>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn" onClick={() => props.onShift(-1)}>
            -1 day
          </button>
          <button type="button" class="btn" onClick={() => props.onShift(0)}>
            Today
          </button>
          <button type="button" class="btn" onClick={() => props.onShift(1)}>
            +1 day
          </button>
          <A href={`/edit/${props.note.id}`} class="btn">
            Edit
          </A>
        </div>
      </div>
    </li>
  );
}
