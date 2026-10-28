// Which keydown events a study deck's window-level shortcuts must leave alone.
// The decks listen on `window` (so the shortcuts work from anywhere on the
// page), which means every key press passes through them — including Enter on
// the Edit button or ArrowRight inside a toggle group. This decides when a key
// already belongs to something else.

// Anything that takes typed text.
const TEXT_ENTRY =
  "input, textarea, select, [contenteditable=''], [contenteditable=true]";

// Widgets that use the arrow keys / Enter / Space themselves (radix roving
// focus, menus, the select popover, the app nav).
const COMPOSITE =
  "[role=combobox], [role=listbox], [role=option], [role=menu], [role=menubar], [role=menuitem], [role=menuitemradio], [role=menuitemcheckbox], [role=tablist], [role=tab], [role=radiogroup], [role=radio], [role=switch], [role=slider], [role=spinbutton], [role=dialog], [role=alertdialog], [data-slot=select-trigger], [data-app-nav]";

// Controls activated by Enter / Space.
const ACTIVATABLE = "button, a[href], summary, [role=button], [role=link]";

// The subset of KeyboardEvent this reads — kept narrow so it's testable
// without a DOM.
export type DeckKeyEvent = {
  key: string;
  repeat: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  target: EventTarget | null;
};

type Closest = { closest(selector: string): unknown };

function hasClosest(target: unknown): target is Closest {
  return (
    typeof target === "object" &&
    target !== null &&
    typeof (target as Closest).closest === "function"
  );
}

/**
 * True when a deck should ignore this key press. `card` is the deck's own
 * study-card button: Enter / Space on it are the deck's flip shortcut, so it's
 * the one activatable control the deck keeps.
 */
export function shouldIgnoreDeckKey(
  e: DeckKeyEvent,
  card: unknown = null
): boolean {
  // Browser / OS shortcuts (Cmd+R, Ctrl+1 …), a held key, or a key another
  // handler already consumed.
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.defaultPrevented) {
    return true;
  }
  const t = e.target;
  if (!hasClosest(t)) return false;
  if (t.closest(TEXT_ENTRY) || t.closest(COMPOSITE)) return true;
  if (e.key === "Enter" || e.key === " ") {
    const control = t.closest(ACTIVATABLE);
    if (control && control !== card) return true; // let it activate itself
  }
  return false;
}
