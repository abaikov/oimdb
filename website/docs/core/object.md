---
sidebar_position: 4
---

# Object

`OIMReactiveObject<TKey, TValue>` is a reactive key-value store for single values: app settings, feature flags, current user, UI state. Unlike collections, it has no primary key — keys are typed string literals defined at the type level.

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
