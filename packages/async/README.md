# @oimdb/async

Deprecated, private and empty: it exports nothing. Do not use it in new code.

## What to use instead

Keep the asynchrony outside the store: `await` your I/O, then write the result
into an ordinary collection.

```ts
import { OIMDB } from '@oimdb/core';
import { createOIMSlotContentEntityService } from '@oimdb/core';
import { createOIMSlotCollectionService } from '@oimdb/core';

type User = { id: string; name: string };
declare function fetchUsers(): Promise<User[]>;

const db = new OIMDB();
const userService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<User>() });
const users = userService.createStoreSlot(db);

const fetchedUsers = await fetchUsers();
userService.writeInBatch(users, () => (fetchedUsers).map(entity => userService.writeSlotContentByKey(users, entity.id, entity)));
db.flush();
```

For loading and saving state, use [`@oimdb/persist`](../persist).
