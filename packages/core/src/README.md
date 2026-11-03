# How `packages/core/src` is laid out

`src/` holds one folder per domain and `index.ts`, the barrel that decides what is public.
There are no layers (`engine/`, `facade/`, `factories/` are gone): everything about a domain —
its services, its slot types, its factories, its defaults' options — is in that domain's folder.

## The domains

| Folder | What lives there |
|---|---|
| `slot/` | `TOIMSlot`, the slot owner, slot collection and single slot services (and their `Writable` versions), their factories, slot content change delivery and listeners, `TOIMEditable` |
| `store/` | store slots, slot store services (map, tree, single), slot filing |
| `channel/` | the channel slot, its queues, frame and flush |
| `effect/` | `OIMEffectService`, `TOIMEffect`, effect bodies and flags |
| `computed/` | computed value and sources services, every computed service and its factory, source trackers |
| `entity/` | entity slots and content service, entity writers, column patching of an entity |
| `column/` | column slots, column slot owners, `OIMColumnSlotService` |
| `bucket/` | bucket content services, bucket commands, the collection list; `array/`, `set/` and `commands/` are its sub-domains |
| `index/` | index services (plain and sorted), their factories and options, index keys |
| `key/` | composite keys and key tree walks |
| `collector/` | release policies, the release and refetch wheels, the unused slot collector |
| `schedule/` | flush schedulers and timers |
| `error/` | error policies |
| `db/` | `OIMDB`, `TOIMDBOptions`, `OIMDefaults`, `OIMDefaultValue` and the default constants |

## Inside a domain

```
<domain>/
  OIM…Service.ts, OIM…Owner.ts, create…OIM….ts   classes and factories, at the root
  constants/    OIM_* constants
  interfaces/   IOIM*
  types/        TOIM*
  utils/        oim* functions and create* helpers that build plain structs
  tests/        tests of this domain
```

## Where a file goes

1. **A factory goes to the domain of what it builds**, and its options type and its
   `oimResolve*` helper go beside it: `createOIMSlotCollectionService` → `slot/`,
   `createOIMSortedComputedService` → `computed/`, `resolveOIMSlotOwnerServiceOptions` →
   `slot/utils/`.
2. **A helper used by one domain lives in that domain**, even if its name mentions another one:
   `createOIMColumnsKeySelector` is used only by the index resolver, so it is `index/utils/`.
3. **A test goes to the domain it tests**, not to the folder of the file it happens to import.
   Tests that read the whole engine (censuses, doc checks) stay in `packages/core/tests/`.
4. **A new domain is a decision.** `scripts/check-structure.mjs` holds the list of domains and
   refuses a file anywhere else; adding a folder means adding it there.

## Who imports whom

Value imports between domain folders (types left out), outside tests:

| Domain | imports values from |
|---|---|
| `bucket` | channel, collector, computed, db, slot, store |
| `channel` | collector, schedule |
| `collector` | channel, error, schedule, slot |
| `column` | channel, collector, computed, slot |
| `computed` | bucket, channel, collector, column, db, slot, store |
| `db` | channel, collector, entity, error, index, key, schedule, slot, store |
| `effect` | channel, computed, slot |
| `entity` | bucket, channel, collector, computed, db, slot |
| `index` | bucket, channel, computed, db, slot, store |
| `key` | slot |
| `slot` | channel, collector, column, db, store |
| `store` | key, slot |

The domains are not layers: `slot`, `channel` and `collector` import each other, and the
factories inside `slot`, `entity`, `index` and `computed` import `db` for `OIMDB` and the
`OIM_DEFAULT_*` values while `db/constants/` imports the default implementations from them.

`effect` is the top: no domain imports a value from it. `slot` and `channel` import `TOIMEffect`
as a type only (a slot keeps its subscribers, a channel queues effects), and `computed` never
imports `effect` outside its tests.

## The `index` folder and `index.ts`

The domain `index/` and the barrel `index.ts` share a name. Inside `src/index/`, import the
barrel as `'../../index'` (resolves to `src/index.ts`), never as `'..'`: a bare `'..'` is read
as the folder `src/index/` and fails.
