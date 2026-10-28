"use client";

import { useEffect, type RefObject } from "react";

// Focus `ref` when the surface shows — but only with a fine pointer (mouse /
// trackpad), and only if nothing else has focus. On a phone, autoFocus pops the
// on-screen keyboard over the page before the person has decided to type; and
// when someone is arrowing through the tab list (radix tabs activate on focus,
// and <Activity> re-runs this effect each time a tab is shown), pulling focus
// into the input would break their next arrow press.
//
// Deferred a frame so the check sees the settled page: on a ?tab=… load the
// first render shows the default tab until the URL is read, and its input is
// hidden again by then (checkVisibility()).
export function useDesktopAutoFocus(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const frame = requestAnimationFrame(() => {
      const el = ref.current;
      const active = document.activeElement;
      if (!el || (active && active !== document.body)) return;
      if (el.checkVisibility && !el.checkVisibility()) return;
      el.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [ref]);
}

// The same policy for a form dialog, called from its `onOpenAutoFocus`. Radix
// would focus — and select the text of — the first field, which pops the phone
// keyboard over the dialog and lets one stray key replace a prefilled word.
// With a fine pointer `field` gets focus without the selection; otherwise the
// dialog itself does, so focus is still trapped inside for screen readers.
export function focusDialogOnOpen(event: Event, field: HTMLElement | null) {
  event.preventDefault();
  const target = window.matchMedia("(pointer: fine)").matches ? field : null;
  (target ?? (event.currentTarget as HTMLElement)).focus({
    preventScroll: true,
  });
}
