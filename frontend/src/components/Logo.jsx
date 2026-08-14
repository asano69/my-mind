import { A } from "@solidjs/router";

// size: overall pixel size of the icon (width == height). Defaults to
// 40px (the old fixed "w-10 h-10" Tailwind size).
// showTitle: whether to render "Solid Mind" next to the icon.
// linkable: whether clicking the logo navigates home ("/"). Defaults to
// false and must stay false for Login.jsx's usage: Login is rendered by
// AuthGate as a fallback *outside* the Router (see main.jsx), so
// wrapping it in <A> there would break routing context. Only pass
// linkable={true} from places that are guaranteed to render inside
// <Router> (e.g. TopBar/LeftPanel-style chrome).
// onClick: if provided, the logo becomes a plain clickable button
// instead of a link, and `linkable` is ignored -- used by RightPanel.jsx
// to trigger a canvas reload instead of navigating away.
export default function Logo(props) {
  const size = () => props.size ?? 40;

  const icon = (
<svg
  viewBox="0 0 30.231 30.231"
  class="transition-transform duration-1500 ease-in-out group-hover:scale-x-[-1]"
  style={{
    width: `${size()}px`,
    height: `${size()}px`,
    position: "static",
  }}
  fill="#9a9996"
  xmlns="http://www.w3.org/2000/svg"
>
  <g transform="matrix(1.4740164,-0.43977645,0.86266597,0.75143529,-17.538404,9.552593)">
    <path d="M 25.343,3.585 C 24.841,2.908 23.815,2.373 22.707,2.188 22.875,1.442 22.561,0.644 21.861,0.241 21.007,-0.254 19.91,0.039 19.416,0.896 19.318,1.065 18.675,2.321 17.714,4.21 16.068,3.856 14.437,3.53 13.089,3.414 11.807,3.303 10.073,3.294 9.813,4.494 c -0.354,1.631 2.031,3.647 4.813,5.799 -0.618,1.221 -1.263,2.496 -1.917,3.788 -2.15,-1.01 -3.904,-1.625 -4.68,-0.821 -1.085,1.124 -0.127,2.754 0.98,4.642 0.316,0.538 0.641,1.093 0.931,1.656 -2.925,5.784 -5.393,10.673 -5.393,10.673 0,0 2.715,-4.145 6.033,-9.217 0.536,1.536 0.556,3.084 -0.81,4.496 -0.114,0.118 -0.111,0.307 0.007,0.422 0.019,0.017 0.038,0.032 0.059,0.043 0.116,0.066 0.267,0.049 0.363,-0.051 1.708,-1.767 1.523,-3.702 0.784,-5.528 1.045,-1.598 2.139,-3.271 3.221,-4.928 0.023,0.012 0.046,0.023 0.067,0.034 3.134,1.549 6.093,3.012 6.941,1.491 0.838,-1.499 -1.493,-3.516 -4.291,-5.687 1.478,-2.264 2.812,-4.311 3.809,-5.843 2.45,0.494 4.011,0.665 4.53,0.084 0.536,-0.593 0.565,-1.308 0.083,-1.962 z M 10.268,18.906 C 10.025,18.458 9.769,18.019 9.523,17.601 8.539,15.923 7.687,14.474 8.457,13.676 c 0.508,-0.526 2.205,0.113 3.981,0.939 -0.727,1.439 -1.459,2.884 -2.17,4.291 z m 10.424,-2.203 c -0.572,1.025 -3.668,-0.506 -6.156,-1.734 -10e-4,0 -0.002,-10e-4 -0.003,-10e-4 0.701,-1.073 1.394,-2.134 2.061,-3.156 2.411,1.872 4.696,3.821 4.098,4.891 z M 14.9,9.753 C 12.474,7.87 10.12,5.885 10.395,4.623 10.515,4.076 11.403,3.869 13.037,4.01 14.309,4.121 15.86,4.426 17.433,4.763 16.714,6.177 15.844,7.891 14.9,9.753 Z m 4.657,-5.141 c -0.093,-0.021 -0.184,-0.04 -0.273,-0.06 -0.26,-0.462 0.674,-2.803 0.908,-3.208 0.246,-0.428 0.795,-0.575 1.223,-0.328 0.39,0.224 0.529,0.691 0.371,1.096 -0.512,0.014 -1.016,0.108 -1.469,0.319 -0.15,0.069 -0.216,0.246 -0.146,0.396 0.067,0.149 0.247,0.215 0.396,0.145 0.252,-0.117 0.53,-0.181 0.813,-0.222 -0.499,0.654 -1.352,1.651 -1.823,1.862 z m 5.262,0.539 c -0.322,0.358 -1.943,0.129 -3.74,-0.225 0.769,-1.182 1.271,-1.962 1.404,-2.181 0.993,0.135 1.938,0.599 2.379,1.196 0.317,0.428 0.303,0.823 -0.043,1.21 z" />
  </g>
</svg>
  );

  // Scales with the icon: at the old default size (40px), this works
  // out to 20px, matching the previous fixed "text-xl" class.
  const titleFontSize = () => size() * 0.65;

  const title = props.showTitle && (
    // Set font-family directly via style rather than the "font-serif"
    // Tailwind utility class: inline style always wins over any class,
    // so this can't be silently overridden regardless of class
    // generation/ordering.
    <span
      class="whitespace-nowrap"
      style={{
        "font-family": "var(--font-serif)",
        "font-size": `${titleFontSize()}px`,
      }}
    >
      Solid Mind
    </span>
  );

  // Wraps `children` in whatever interactive element this instance
  // needs: a plain button when onClick is given (takes priority over
  // linkable), a home link when linkable, or nothing at all otherwise.
  // "contents" keeps the wrapper out of the flex/centering layout below,
  // the same way <A> (an inline <a>) already does.
  const wrap = (children) =>
    props.onClick ? (
      <button
        type="button"
        onClick={props.onClick}
        title={props.title}
        class="contents"
      >
        {children}
      </button>
    ) : props.linkable ? (
      <A href="/">{children}</A>
    ) : (
      children
    );

  // When showTitle is off, layout is simple: icon only, no centering
  // concerns.
  if (!props.showTitle) {
    return wrap(icon);
  }

  // centerTitle=true: for callers wrapping Logo in something like
  // `flex justify-center`, where the *title text* (not the icon+title
  // pair as a block) should end up centered, with the icon sitting just
  // to its left. Achieved by centering only the title in normal flow,
  // then absolutely positioning the icon just to its left (relative to
  // this component's own wrapper), so the icon never affects the text's
  // centering.
  //
  // centerTitle=false (default): plain side-by-side layout, icon then
  // title, both centered as one block by the caller if needed.
  const content = props.centerTitle ? (
    <span class="group relative flex items-center justify-center">
      <span
        class="absolute right-full mr-2"
        style={{ width: `${size()}px`, height: `${size()}px` }}
      >
        {icon}
      </span>
      {title}
    </span>
  ) : (
    <span class="group flex items-center gap-2">
      {icon}
      {title}
    </span>
  );

  return wrap(content);
}
