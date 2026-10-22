# @oimdb/async

Deprecated, private and empty: it exports nothing. Do not use it in new code.

## What to use instead

Keep the asynchrony outside the store: `await` your I/O, then write the result
into an ordinary collection.

```ts
import { OIMDB, createOIMEntityService } from '@oimdb/core';

type User = { id: string; name: string };
declare function fetchUsers(): Promise<User[]>;

const db = new OIMDB();
const userService = createOIMEntityService<User>(db, { keyOf: (user) => user.id });
const users = userService.createStoreSlot(db);

const fetchedUsers = await fetchUsers();
userService.slotContentService.upsertEntities(users, fetchedUsers);
db.flush();
```

For loading and saving state, use [`@oimdb/persist`](../persist).
