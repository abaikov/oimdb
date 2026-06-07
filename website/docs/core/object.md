---
sidebar_position: 4
---

# Object

`OIMReactiveObject<TKey, TValue>` is a reactive key-value store for single values: app settings, feature flags, current user, UI state. Unlike collections, it has no primary key — keys are typed string literals defined at the type level.

> **Object vs Collection.** Use an **object** for a fixed, known set of *named* values (settings, the current user, a few UI flags) — keys are string-literal types, there is no id. Use a [collection](/docs/core/model) for a *dynamic set of entities* keyed by a primary key. Both subscribe per-key and deliver through the same queue, so they coalesce together.

## Basic usage

```typescript
import { OIMReactiveObject, OIMEventQueue } from '@oimdb/core';

type TSettings = 'theme' | 'lang' | 'sidebar';

const settings = new OIMReactiveObject<TSettings, string>(queue);

settings.setProperty('theme', 'dark');
settings.setProperty('lang', 'en');

settings.merge({ theme: 'light', lang: 'fr' }); // set multiple at once

settings.get('theme');    // 'light'
settings.getAll();        // { theme: 'light', lang: 'fr' }
settings.keys();          // ['theme', 'lang']
settings.count();         // 2

settings.delete('lang');
settings.clear();
settings.destroy();
```

## Subscriptions

Subscriptions work exactly like collections — key-scoped and delivered through the queue.

```typescript
// Subscribe to one key
const off = settings.subscribeOnKey('theme', () => {
  console.log('theme changed:', settings.get('theme'));
});

// Subscribe to multiple keys at once
const off2 = settings.subscribeOnKeys(['theme', 'lang'], () => {
  console.log('theme or lang changed');
});

settings.setProperty('theme', 'dark');
queue.flush(); // callbacks fire once

off();
off2();
```

## With React

`@oimdb/react` exposes object hooks that re-render a component only when the key it watches changes:

```tsx
import { useSelectValueByObjectKey, useSelectValuesByObjectKeys } from '@oimdb/react';

function ThemeToggle() {
  const theme = useSelectValueByObjectKey(settings, 'theme'); // string | undefined
  return (
    <button onClick={() => settings.setProperty('theme', theme === 'dark' ? 'light' : 'dark')}>
      {theme ?? '—'}
    </button>
  );
}

function Header() {
  const [theme, lang] = useSelectValuesByObjectKeys(settings, ['theme', 'lang']);
  return <header className={theme}>{lang}</header>;
}
```

Hold the object in a module/closure (or pass it through your own context), the same way you wire collections.

## Delivery model

Writes are **batched through the queue**. `setProperty` / `merge` / `delete` mark the changed keys dirty and schedule a single delivery on the next `queue.flush()`. Two consequences:

- **Coalescing** — several writes in the same tick collapse into one notification per key.
- **Glitch-free with the rest of oimdb** — update an object *and* a collection in one action and subscribers see a single consistent batch, not two separate renders.

This is the deliberate trade-off against a synchronous micro-observable (which calls subscribers inline on every write): for one isolated write the sync model has less overhead, but it can't coalesce and can tear across mixed updates. If you specifically need synchronous, non-queued notification for a standalone value, the non-reactive `OIMObject` base exposes a plain `emitter` that fires inline — at the cost of no queue integration. See [Performance](/docs/guides/performance) for the numbers and the trade-off.

## Selectors

Use selectors when you need a reactive read that delivers values directly to a callback — in UI code or inside effects.

Requires an `OIMComputeRuntime`.

```typescript
import {
  OIMObjectValueByKeySelector,
  OIMObjectValuesByKeysSelector,
  OIMComputeRuntime,
} from '@oimdb/core';

const runtime = new OIMComputeRuntime(queue);

// Watch one key — fires immediately with current value, then on each change
const themeSelector = new OIMObjectValueByKeySelector(runtime, settings, 'theme');
const off = themeSelector.watch((theme) => {
  applyTheme(theme); // called immediately + on every change
});

// Watch multiple keys — delivers an array in the same order as keys
const multiSelector = new OIMObjectValuesByKeysSelector(
  runtime,
  settings,
  ['theme', 'lang']
);
multiSelector.watch(([theme, lang]) => {
  console.log(theme, lang);
});

// Sync read without watching
themeSelector.getValue(); // current value or undefined

off(); // stop watching
```

## As an effect dependency

Pass `OIMReactiveObject` directly to `OIMEffectDependencyKeyedObject`:

```typescript
import {
  OIMEffect,
  OIMEffectDependencyKeyedObject,
  OIMComputeRuntime,
} from '@oimdb/core';

const runtime = new OIMComputeRuntime(queue);

const effect = new OIMEffect(runtime, {
  deps: [new OIMEffectDependencyKeyedObject(settings, ['theme', 'lang'])],
  run: () => {
    rerender({ theme: settings.get('theme'), lang: settings.get('lang') });
  },
});

effect.destroy();
```
