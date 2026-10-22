// What is deliberately LEFT IN makes the excised arm larger, so this spec is a LOWER BOUND.
// The `import { createOIMColumnOwnerPushDriven }` lines in createOIMEntityService.ts and createOIMBucketSlotOwnerService.ts
// are NOT removed: with the option that used them gone they are unused and the bundler drops the module,
// and that module's absence from the excised breakdown is the proof no link was missed.
// `index.ts`'s re-exports of the column owners are left in on purpose — a named import keeps only what it names.
import type { TBundleExcision } from './TBundleExcision';

export const fieldMachineryExcision: readonly TBundleExcision[] = [
    {
        module: 'factories/createOIMEntityService.ts',
        rules: [
            {
                kind: 'line',
                matches: /^[ \t]*createColumnOwner: createOIMColumnOwnerPushDriven,$/,
                times: 1,
                what: 'the option that links the push-driven column owner into every entity service',
            },
        ],
    },
    {
        module: 'factories/utils/createOIMBucketSlotOwnerService.ts',
        rules: [
            {
                kind: 'line',
                matches: /^[ \t]*createColumnOwner: createOIMColumnOwnerPushDriven,$/,
                times: 1,
                what: 'the option that links the push-driven column owner into every bucket service',
            },
        ],
    },
    {
        module: 'engine/entity/OIMSlotContentEntityService.ts',
        rules: [
            {
                kind: 'statement',
                starts: /^[ \t]*slotOwnerService\.columnOwner\.markColumnsChanged\(/,
                times: 2,
                what: 'every entity write reporting the columns it changed, through markEntityChanged and through dispatchColumnsChanged',
            },
        ],
    },
    {
        module: 'facade/bucket/OIMSlotContentBucketService.ts',
        rules: [
            {
                kind: 'statement',
                starts: /^[ \t]*slotOwnerService\.columnOwner\.markColumnsChanged\(/,
                times: 1,
                what: 'every bucket write reporting the columns it changed',
            },
        ],
    },
    {
        module: 'engine/entity/utils/createOIMEntitySlot.ts',
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
