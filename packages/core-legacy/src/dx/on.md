# `on` — prose moved out of the source

The block below stood over `export const on` in `on.ts` and is reproduced verbatim.

Dependency builders for `computed` / `effect`. They pick the right wrapper for
each source type so you never instantiate `OIMEffectDependency…` by hand:

```ts
kit.computed(
  [on.collection(users, 'u1'), on.index(byRole, 'admin'), on.computed(orderCount)],
  () => …,
);
```

The four members carried a one-line description each — "Depend on one PK of a collection.",
"Depend on one key of an index.", "Depend on one key of a reactive object.", "Depend on
another computed." — each restating its own name and signature. They are not reproduced as
separate sections above; they said nothing the member did not.
