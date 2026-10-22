---
slug: effect-as-a-literal
title: "An effect as a literal, driven by one service"
authors: [oimdb]
tags: [internals, performance]
date: 2026-10-18
---

An effect used to be a class instance that carried its own state and its own methods. It is now a plain object literal, and every effect on a channel is driven by one long-lived `OIMEffectService`. Two recorded pieces price the shape itself: with the hidden-class loss at a full GC held out, the class was 1.15–1.17× dearer to create and within a few percent of the literal on wake and dispose.

{/* truncate */}

## Context

An effect is the thing that subscribes. It holds its source slots and source computeds, files itself onto every root it reads, remembers the position it was filed at in each, and runs its body when a source moved since its last run.

Up to 2026-10-18 that was `OIMEffect`, a class whose fields were assigned in the constructor and whose behaviour lived on the prototype.

## Question

Does keeping an effect as one class instance cost anything, against keeping its state in a plain literal and its behaviour in functions every effect shares — across its whole life: creating many, waking many, disposing many?

## The two arms

- **Class** — the shipped `OIMEffect` at the time of the run, created through `channel.effect(rootSlots, [], body)`.
- **Literal and shared functions** — a plain object literal with the same fields, plus `runIfSourcesChanged` and `setPositionInSubscribedSlot` as own properties pointing at shared functions, because the channel and `OIMSlotOwner.unsubscribeFromSlot` call those two on the effect. Everything else is module-level functions taking the object.

Both arms run the same algorithm and subscribe through the same `OIMSlotOwner.subscribeToSlot`, so each arm is timed in its own process (`isolate`). Each arm keeps **one resident effect alive for the whole process**, so what these rows measure is the shape, with the hidden-class collection described below held out.

The pair is `alt.effect-shape.class-vs-literal-and-service.*` in `packages/bench/src/price/alternativePairsEffectShape.ts`.

## The measurement

[`2026-10-18-alternatives/effect-shape/`](https://github.com/oimdb/oimdb/tree/master/packages/bench/measurements/2026-10-18-alternatives/effect-shape) holds all three rows; [`2026-10-18-alternatives/effect-shape-create-rerun/`](https://github.com/oimdb/oimdb/tree/master/packages/bench/measurements/2026-10-18-alternatives/effect-shape-create-rerun) re-ran the create row alone. In both reports `ours` is the class and the floor is the literal.

| row | class | literal | ratio | what one operation is |
|---|---|---|---|---|
| `create` | 109 ns | 93 ns | 1.17× | one effect created and subscribed to 8 roots |
| `create` (re-run) | 109 ns | 95 ns | 1.15× | the same |
| `wake` | 2.04 µs | 2.07 µs | 0.99× | one write and one frame over 1024 effects standing on 57 overlapping 8-row windows of 64 rows; up to 8 effects run |
| `dispose` | 93 ns | 98 ns | 0.95× | one effect unsubscribed from 8 roots |

`create` carries `!~` in both runs: the literal won the row, and the spread inside the process exceeded 30% — 25.3% / 46.2% in the first run, 10.4% / 197.3% in the re-run. Read it as a direction rather than as a size.

The instrument: `control-resolution-2x` read 1.97× and 1.98×, `control-scale-same-body` 1.00× in both, 0.1% from 1.00. **Both pieces were measured with the load gate raised to 12.00** (`gateWasRaised: true` in each `machine.json`), well above the default.

## What was chosen

The literal. `OIMEffectService.createEffect` builds a `TOIMEffect` literal and files it on every root; `disposeEffect`, `setPositionInSubscribedSlot` and the run path are methods of the one service, which the effect reaches through its `effectService` field.

The rows above are not the reason. On their own they say the class costs a little at creation and close to nothing after it. The reason is the loss the rows deliberately hold out: V8 keeps a constructor's map transitions weakly, so when every instance of a class dies before a full GC — a screen that unmounts every effect — the hidden class is collected and every optimised function that embedded it is deoptimised. The analysis is in `packages/bench/WHY-EACH-ROW.md`, section "`churnChain` — the oimdb spread is V8 collecting a hidden class". Its figures come from worker runs and deopt traces that are not an artifact under `packages/bench/measurements/`, so none of them is quoted here.

The same loss applies to `OIMSingleComputed`, which is still a class. It keeps one instance of itself alive in a static field, `hiddenClassKeeper`, with its computed slot minted; `packages/core/src/facade/computed/README.md` states why and when to drop it.

## Caveats

- **The shipped literal is not the floor arm exactly.** The floor carried two shared functions as own properties; `TOIMEffect` carries one reference to its `IOIMEffectService` and the channel and `OIMSlotOwner` call through it. Nothing has re-measured the shipped shape.
- The floor skipped the shipped constructor's source-computed dedup `Set` branch and its `try`/`catch`; neither runs for an effect with no source computeds, which is every effect in these rows.
- No row here has a source computed, and no row measures the class with zero live instances — which is the case the change was made for.

## Where it lives

- `packages/core/src/engine/computed/OIMEffectService.ts` — `createEffect`, the literal, and the methods that drive it.
- `packages/core/src/engine/computed/types/TOIMEffect.ts` — the literal's fields.
- `packages/core/src/engine/slot/OIMSlotOwner.ts` — `subscribeToSlot` / `unsubscribeFromSlot`, which both arms used.
- `packages/core/src/facade/computed/OIMSingleComputed.ts` — `hiddenClassKeeper`.
