# @oimdb/async — deprecated

**This package is deprecated and exports nothing. Do not use it in new code.**

It provided async variants of the collection and index, built on the assumption
that the store itself should be asynchronous. That was the wrong seam: a reactive
store holds what the application already has and reports changes synchronously,
while waiting on I/O belongs to whatever fetches or persists. Making reads return
promises bought nothing and cost a parallel set of primitives that had to track
the synchronous ones release for release.

## What to use instead

Keep the asynchrony outside the store — `await` your I/O, then write the result
into an ordinary collection:

```ts
import { createOIMCollectionKit, OIMEventQueue } from '@oimdb/core';

const queue = new OIMEventQueue();
const users = createOIMCollectionKit<User, string>(queue, { selectPk: u => u.id });

const rows = await fetchUsers();   // the await lives here, not in the store
users.collection.upsertMany(rows);
queue.flush();
```

For loading and saving state, use [`@oimdb/persist`](https://www.npmjs.com/package/@oimdb/persist),
which is built for that boundary.

The package stays published so existing installs keep resolving. It will not
receive further releases.
