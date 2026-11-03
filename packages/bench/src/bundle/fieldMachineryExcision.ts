// What is deliberately LEFT IN makes the excised arm larger, so this spec is a LOWER BOUND.
// The `import { createOIMPushColumnSlotOwner }` line in resolveOIMSlotOwnerServiceOptions.ts
// is NOT removed: with the option that used it gone it is unused and the bundler drops the module,
// and that module's absence from the excised breakdown is the proof no link was missed.
// `index.ts`'s re-exports of the column owners are left in on purpose — a named import keeps only what it names.
import type { TBundleExcision } from './TBundleExcision';

export const fieldMachineryExcision: readonly TBundleExcision[] = [
    {
        module: 'slot/utils/resolveOIMSlotOwnerServiceOptions.ts',
        rules: [
            {
                kind: 'line',
                matches: /^[ \t]*createColumnSlotOwner: createOIMPushColumnSlotOwner,$/,
                times: 1,
                what: 'the option that links the push-driven column owner into every entity and bucket collection',
            },
        ],
    },
    {
        module: 'entity/OIMEntityContentService.ts',
        rules: [
            {
                kind: 'statement',
                starts: /^[ \t]*(?:slotOwnerService|this\.slotOwnerServiceOf\(entitySlot\))\.columnSlotOwner\.markColumnsChanged\(/,
                times: 2,
                what: 'every entity write reporting the columns it changed, through markEntityChanged and through dispatchColumnsChanged',
            },
        ],
    },
    {
        module: 'bucket/OIMBucketContentService.ts',
        rules: [
            {
                kind: 'statement',
                starts: /^[ \t]*slotOwnerService\.columnSlotOwner\.markColumnsChanged\(/,
                times: 1,
                what: 'every bucket write reporting the columns it changed',
            },
        ],
    },
    {
        module: 'entity/utils/createOIMEntitySlot.ts',
        rules: [
            {
                kind: 'line',
                matches: /^[ \t]*columnSlotStore: undefined,$/,
                times: 1,
                what: 'the column-slot map\'s field on every row of every population',
            },
        ],
    },
];
