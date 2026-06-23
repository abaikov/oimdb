---
slug: position-addressed-commands
title: "Ordered lists as position-addressed commands"
authors: [oimdb]
tags: [internals, indexes]
date: 2026-06-12
---

For an ordered per-key list, OIMDB doesn't hand you a new array to diff. It emits a stream of commands — insert, remove, move, set, reset — each addressed by position, so an imperative renderer can replay them onto a DOM list with no diff.

{/* truncate */}

## Context

`OIMOrderedListCommandStream` wraps an ordered index (a slot list per key) and exposes it as a replayable command stream — for imperative or virtual-list renderers that apply edits straight to the DOM.

## Problem

Ordered lists change incrementally: one row inserted, one moved, a span removed. A consumer that wants minimal DOM mutations needs to know *what* changed, not just *that* something did. The default reactive shape — "here's the new list, figure out the delta" — forces every consumer to run a list diff (LCS / keyed reconciliation) on every update, which is exactly the work the producer already did when it mutated the list. If the index knows it inserted one slot at position 4, discarding that and making the consumer rediscover it by diffing is wasted information.

## Options

- **Emit the whole new list, diff downstream** — universal, but every consumer pays diff cost on every change and the producer's edit intent is discarded.
- **Emit pk-level diffs (added/removed sets)** — cheaper than full diffing, but loses position and order: useless for a move, ambiguous about where an insert lands.
- **Emit position-addressed commands** — the producer states intent directly: "insert at 4", "move 2→5", "remove 3 from 1". No downstream diffing.

## What OIMDB does

`OIMOrderedListCommandStream` mutates the underlying ordered index and, per edit, appends the matching `TOIMOrderedListCommand`, addressed by index. The protocol:

- `insert` — one element appears at `index`.
- `remove` — `count` elements (default 1, may be > 1) disappear from `index`.
- `move` — `count` elements (default 1) move from `from` to `to`.
- `set` — the element at `index` is replaced in place (one element, not the list).
- `reset` — the whole list for the key is replaced by `items`.

Each writer method (`pushSlot`, `insertSlotAt`, `removeAt`, `removeRange`, `move`, `moveRange`, `setSlotAt`, `setSlots`) performs the index mutation and emits the matching command, using the clamped index the mutation actually landed at. Commands buffer per key and deliver once on `AFTER_FLUSH`.

The axis that decides whether this pays is edit-count vs list-length. Emit-and-diff costs O(list length) per change no matter how small the edit — a reconciler walks the whole list to discover that one row moved. Command replay costs O(edits): one moved row is one `move`. So the win scales with how big the list is relative to how much of it changes per tick — large list, small incremental edits is where it matters (a 10k-row virtual list nudged by one insert), and it's a wash or worse when most of the list changes at once.

## Cost

Consumers implement a small state machine — replay the protocol against their own list — instead of assigning a new array. That's strictly more consumer code than `list = newList`, and only some renderers can use it: an imperative/DOM/canvas target that applies edits in place benefits, a React tree that re-renders from a new array gains nothing and still pays the state machine. Whole-list edits also coalesce: a `reset` supersedes everything buffered before it, and once a batch starts with a reset, later structural edits fold into a fresh reset. So an update that touches the whole list yields a `reset`, not fine-grained commands — the incremental path isn't automatically cheaper than replacing the array.

## Where it lives

- `packages/core/src/modules/wrapper/index/TOIMOrderedListCommand.ts`
- `packages/core/src/modules/wrapper/index/OIMOrderedListCommandStream.ts`
