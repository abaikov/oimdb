---
sidebar_position: 0
title: Recipes
description: Task-sized recipes, each with what to construct, a complete example, why it is built that way and the reference page that explains it.
---

# Recipes

One task per section: what to construct, a complete example, why it is built that
way, and the reference page that explains it in full. Each recipe stands alone.

| Page | Sections |
|---|---|
| [Storing data](/docs/recipes/data) | load an API response into a collection; update part of an entity, replace it whole, or drop a column; delete an entity; one-to-many (messages by chat); many-to-many (users and groups); key an entity by more than one field; a single record (settings or the session); soft delete; choose the in-place or the replacing writer |
| [Lists](/docs/recipes/lists) | group entities by a field; a sorted list per group; a list that is the whole collection; a filtered list; a page or an infinite list in server order; search results or one ad-hoc list; a selection set; reorder by drag and drop; a count or a sum per group; several groups fetched at once |
| [Reacting to changes](/docs/recipes/reactivity) | run code when one entity changes; react only to one field; a derived value; many writes, one delivery; flush automatically; write in response to a change; clean up what an effect body started; route errors from effects; know which entities changed in a frame |
| [Memory and lifetime](/docs/recipes/memory) | keep a screen's data only while the screen is open; read without keeping; cache with expiry; never release; drop everything on logout; keep a long-lived handle correctly |
| [React](/docs/recipes/react) | give every hook the database and the effect service; render one entity by its key; render one field of a wide entity; render a list where each item re-renders alone; render the group an index keeps; render a group sorted by a column; show a derived value; deliver once per painted frame |
| [Persistence, SSR and server sync](/docs/recipes/app) | save a collection to localStorage and load it on start; save a collection to IndexedDB, writing only what changed; render on the server and hydrate on the client; update optimistically and roll back on failure; apply a server push or a websocket patch; keep a Redux store in step with a collection |
