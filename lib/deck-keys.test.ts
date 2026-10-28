// Tests for the deck shortcut guard (lib/deck-keys.ts). Run with:
//   node --test lib/deck-keys.test.ts
//
// The contract: the deck's window-level shortcuts never steal a key that
// belongs to something else — browser shortcuts, held keys, text fields,
// composite widgets (toggle groups, selects, menus), or Enter/Space on any
// button other than the study card itself.

import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldIgnoreDeckKey, type DeckKeyEvent } from "./deck-keys.ts";

// A fake element whose closest() matches any selector part naming one of
// `matches` (e.g. "button", "[role=radio]").
function el(...matches: string[]) {
  const node = {
    closest(selector: string) {
      const parts = selector.split(",").map((s) => s.trim());
      return parts.some((p) => matches.includes(p)) ? node : null;
    },
  };
  return node;
}

function key(k: string, over: Partial<DeckKeyEvent> = {}): DeckKeyEvent {
  return {
    key: k,
    repeat: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    defaultPrevented: false,
    target: null,
    ...over,
  } as DeckKeyEvent;
}

test("plain shortcut keys on the page body are the deck's", () => {
  const body = el("body");
  for (const k of [" ", "Enter", "r", "h", "ArrowLeft", "ArrowRight", "1", "2"]) {
    assert.equal(shouldIgnoreDeckKey(key(k, { target: body as never })), false, k);
  }
});

test("modifier combos and held keys are left to the browser", () => {
  assert.equal(shouldIgnoreDeckKey(key("r", { metaKey: true })), true);
  assert.equal(shouldIgnoreDeckKey(key("1", { ctrlKey: true })), true);
  assert.equal(shouldIgnoreDeckKey(key("h", { altKey: true })), true);
  assert.equal(shouldIgnoreDeckKey(key("ArrowRight", { repeat: true })), true);
  assert.equal(shouldIgnoreDeckKey(key(" ", { defaultPrevented: true })), true);
});

test("text fields keep every key", () => {
  for (const tag of ["input", "textarea", "select", "[contenteditable=true]"]) {
    assert.equal(shouldIgnoreDeckKey(key("r", { target: el(tag) as never })), true, tag);
  }
});

test("composite widgets keep their arrows (toggle group, select, menu, nav)", () => {
  for (const role of [
    "[role=radio]",
    "[role=tab]",
    "[role=option]",
    "[role=menuitem]",
    "[data-slot=select-trigger]",
    "[data-app-nav]",
  ]) {
    assert.equal(
      shouldIgnoreDeckKey(key("ArrowRight", { target: el(role) as never })),
      true,
      role
    );
  }
});

test("Enter/Space on another button activate that button", () => {
  const edit = el("button");
  assert.equal(shouldIgnoreDeckKey(key("Enter", { target: edit as never })), true);
  assert.equal(shouldIgnoreDeckKey(key(" ", { target: edit as never })), true);
  assert.equal(shouldIgnoreDeckKey(key("Enter", { target: el("a[href]") as never })), true);
});

test("Enter/Space on the study card itself are the flip shortcut", () => {
  const card = el("button");
  assert.equal(shouldIgnoreDeckKey(key("Enter", { target: card as never }), card), false);
  assert.equal(shouldIgnoreDeckKey(key(" ", { target: card as never }), card), false);
});

test("non-activating shortcut keys still work while a button has focus", () => {
  const gotIt = el("button");
  assert.equal(shouldIgnoreDeckKey(key("ArrowLeft", { target: gotIt as never })), false);
  assert.equal(shouldIgnoreDeckKey(key("r", { target: gotIt as never })), false);
});

test("a non-element target (window, document) is not ignored", () => {
  assert.equal(shouldIgnoreDeckKey(key(" ", { target: {} as never })), false);
});
