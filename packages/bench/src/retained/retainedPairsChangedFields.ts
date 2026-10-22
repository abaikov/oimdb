import {
    OIMCollection,
    OIMCollectionChangedFields,
    OIMEventQueue,
} from '../../../core-legacy/src/index';
import { ERetainedPath } from './ERetainedPath';
import type { TPriceDataRow } from '../price/TPriceDataRow';
import type { TRetainedPair } from './TRetainedPair';
import type { TRetainedPopulation } from './TRetainedPopulation';

/**
 * WHAT `detectExternalMutations` COSTS, IN BYTES.
 *
 * THE CLAIM.
 * `packages/core-legacy/src/modules/wrapper/collection/OIMCollectionChangedFields.ts:72-77`
 * tells a user that turning the option off "drops the per-write snapshot clone
 * and the per-PK snapshot map (~2x entity memory)" — a retained-heap claim,
 * stated as a reason to change a flag, with no artifact behind it.
 *
 * MEASURED ON THE LEGACY PACKAGE, and that is a choice rather than an oversight:
 * the current engine has NO equivalent option (checked, not assumed —
 * `packages/core/src` holds no per-entity snapshot of any kind), so the claim can
 * only be settled where it lives. `packages/core-legacy` is not dead code — it is
 * the `oimdb-legacy` row of the timing report, and this sentence is still in the
 * source a reader of that package would open.
 *
 * WHAT WAS WRONG UNTIL 2026-09-01 was not this file but the catalogue around it:
 * these were the ONLY measured pairs, so `npm run retained` weighed nothing that
 * ships. `retainedPairsDerivations.ts` is the shipped engine's family, and nothing
 * here was ported into it — the mechanism it prices does not exist to port. `packages/core-legacy` is not dead code — it is
 * the `oimdb-legacy` row of the timing report, and this sentence is still in the
 * source a reader of that package would open.
 *
 * NOTHING HERE WAS PORTED INTO `retainedPairsDerivations.ts`, which is the
 * shipped engine's family — the mechanism this one prices does not exist to
 * port. These rows are not the whole catalogue; a catalogue holding only them
 * would weigh nothing that ships.
 *
 * TWO ROWS AND NOT ONE, because "~2x entity memory" is a RATIO and no single
 * delta can settle it. One row measures what the option holds, the other what an
 * entity holds, and the report prints both figures so the reader takes the
 * quotient.
 *
 * THE MULTIPLE IS A PROPERTY OF THE ROW SHAPE, and any single number for it — 2x
 * included — is a number for one shape: `updateEntitySnapshot` stores
 * `{ ...entity }`, and a spread copies REFERENCES, so the clone pays for a shell
 * and shares every string. The shape measured here is the one this suite uses
 * everywhere else.
 */

const ENTITIES = 100_000;

/** Matching `priceDataset`. */
const GROUPS = 64;

/**
 * Built ONCE per arm. A `` `group-${i % 64}` `` inside the loop would put a
 * hundred thousand fresh strings in every arm's entity cost: V8 does not intern
 * strings a program builds at run time.
 */
const groupNames = (): readonly string[] => {
    const names: string[] = [];
    for (let i = 0; i < GROUPS; i++) names.push(`group-${i}`);
    return names;
};

const TITLES: readonly string[] = [
    'alpha', 'bravo', 'charlie', 'delta',
    'echo', 'foxtrot', 'golf', 'hotel',
];

/**
 * `upsertOneByPk` rather than `upsertMany`: the wrapper's per-write snapshot is
 * what is under test and a batch API would hide how many of them there are. The
 * queue is FLUSHED at the end on both arms — the tracker's per-flush buffers are
 * cleared by its `AFTER_FLUSH` handler, so a measurement before it would be one
 * open batch of a hundred thousand rows rather than the steady state.
 */
const trackedPopulation = (detectExternalMutations: boolean): TRetainedPopulation => {
    const queue = new OIMEventQueue();
    const collection = new OIMCollection<TPriceDataRow, string>();
    const tracker = new OIMCollectionChangedFields<TPriceDataRow, string>(queue, collection, {
        detectExternalMutations,
    });
    const groups = groupNames();
    for (let i = 0; i < ENTITIES; i++) {
        const id = `row-${i}`;
        tracker.upsertOneByPk(id, {
            id,
            group: groups[i % GROUPS],
            rank: i,
            title: TITLES[i % TITLES.length],
            note: 'note',
        });
    }
    queue.flush();
    return { root: { queue, collection, tracker }, rows: ENTITIES };
};

/** No tracker at all: the denominator of the claim. */
const bareCollection = (rows: number): TRetainedPopulation => {
    const collection = new OIMCollection<TPriceDataRow, string>();
    const groups = groupNames();
    for (let i = 0; i < rows; i++) {
        const id = `row-${i}`;
        collection.upsertOneByPk(id, {
            id,
            group: groups[i % GROUPS],
            rank: i,
            title: TITLES[i % TITLES.length],
            note: 'note',
        });
    }
    return { root: collection, rows: ENTITIES };
};

export const retainedPairsChangedFields: readonly TRetainedPair[] = [
    {
        id: 'retained.changed-fields.entities-only',
        path: ERetainedPath.PerRow,
        on: `${ENTITIES.toLocaleString('en-US')} rows in a legacy \`OIMCollection\`, no tracker`,
        off: 'the same collection with nothing written into it',
        caveat:
            'THE DENOMINATOR OF THE CLAIM, AND NOT A COST OF ANYTHING. "~2x entity memory" is a ' +
            'ratio, and the row beside this one is only half of it; this is the other half — what ' +
            'the entities themselves hold in the legacy store, measured the same way, in the same ' +
            'run, on the same machine. WHAT IS IN THE NUMBER: the entity objects the store built ' +
            'from each patch, the per-row slot, the map entry that reaches it, and the one string ' +
            'per row that is genuinely unique (`id`). WHAT IS NOT: the group names and the titles, ' +
            'which are sixty-four and eight distinct strings shared by every row that uses them — ' +
            'built once per arm and therefore not part of any per-row figure. THE SHAPE IS THE ' +
            'ONE THIS SUITE USES EVERYWHERE: two strings, one number, two shared strings. A row ' +
            'shape with more of its bytes behind its references — a description, a nested object — ' +
            'moves this figure up and leaves the snapshot row unchanged, which is exactly why the ' +
            'multiple cannot be quoted without the shape it was measured on.',
        build: arm => (arm === 'on' ? bareCollection(ENTITIES) : bareCollection(0)),
    },

    {
        id: 'retained.changed-fields.snapshots-on-vs-off',
        path: ERetainedPath.PerRow,
        on: '`detectExternalMutations: true` (the default) — a snapshot clone per PK',
        off: '`detectExternalMutations: false` — no clone, no snapshot map',
        caveat:
            'THE CLAIM ITSELF, as the delta between two identical populations written through the ' +
            'same wrapper with the flag turned over. WHAT IS IN THE DELTA, and the third item is ' +
            'not in the sentence the option documents: the shallow clone per PK; the ' +
            '`lastEntitySnapshotByPk` map that holds them; and `writtenThroughThisFlush`, a `Set` ' +
            'the ON arm fills with every PK of the batch and `clear()`s at the flush — cleared, ' +
            'but a cleared container keeps its capacity, so a hundred-thousand-row batch leaves ' +
            'that capacity behind on the ON arm alone. It is a real cost of the option and it is ' +
            'inside this number; a reader comparing the delta against "clone plus map entry" ' +
            'arithmetic should expect the measurement to come out ABOVE it for that reason. THE ' +
            'CLONE IS SHALLOW, which is the whole reason the multiple is not obvious: `{ ...entity }` ' +
            'copies references, so the snapshot pays for a shell and shares every string. Divide ' +
            'this row\'s bytes per row by the `entities-only` row\'s to get the multiple the ' +
            'sentence claims — the report prints both columns so that division is the reader\'s ' +
            'and not ours. RESIDUAL: both arms track changed fields identically (`trackPatch` runs ' +
            'whatever the flag says) and both flush at the end, so the per-flush buffers and their ' +
            'capacities are on both sides and cancel.',
        build: arm => trackedPopulation(arm === 'on'),
    },
];
