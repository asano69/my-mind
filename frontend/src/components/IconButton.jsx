// A small square icon button shared by the floating ribbon toolbars —
// TopBar.jsx's top-right group and LeftPanel.jsx's left ribbon. This
// consolidates what used to be my-mind.css's global `.icon-btn` class
// (previously duplicated, confusingly, by an unrelated identically-named
// class in catalog.css) into one Tailwind-based component instead.
//
// iconButtonClass is exported separately for the one caller that can't
// render a <button> (LeftPanel.jsx's <A href="/catalog"> link).
export const iconButtonClass =
  "z-[1] flex items-center justify-center rounded-md p-4 opacity-65 " +
  "transition-[opacity,background-color,transform] duration-[80ms] " +
  "hover:scale-110 hover:bg-hover hover:opacity-100";

export default function IconButton(props) {
  return (
    <button
      type="button"
      onClick={(e) => props.onClick(e)}
      title={props.title}
      disabled={props.disabled}
      class={iconButtonClass}
      classList={{ "pointer-events-none": props.disabled }}
      style={{ opacity: props.disabled ? 0.15 : undefined }}
    >
      {props.children}
    </button>
  );
}
