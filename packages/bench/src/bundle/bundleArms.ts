import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fieldMachineryExcision } from './fieldMachineryExcision';
import {
    ARM_DATABASE_ONLY,
    ARM_EVERYTHING,
    ARM_FIELD_FLOOR,
    ARM_FIELD_LIFTED,
    ARM_GROUPING_LAYER_PINNED,
    ARM_GROUPING_NONE,
    ARM_GROUPING_ONE,
    ARM_GROUPING_ONE_ORDER_OPTION,
    ARM_GROUPING_ONE_SHARED_MODULE,
    ARM_WITH,
    ARM_WITHOUT,
} from './bundleControls';
import type { TBundleArm } from './TBundleArm';

const here = dirname(fileURLToPath(import.meta.url));
const consumer = (name: string): string => join(here, 'consumers', `${name}.ts`);

/**
 * EVERY APPLICATION THIS HARNESS KNOWS HOW TO BUILD — a catalogue, not a run:
 * which of these an invocation builds is decided by the PIECE selected
 * (`bundlePieces.ts`). An arm no piece names is dead weight.
 *
 * EVERY PAIR IS A PAIR AND MUST STAY ONE. The difference within a pair is the
 * whole measurement; the moment two arms differ in anything but the decision
 * being priced, the number stops being about that decision. The five grouping
 * files share one program verbatim and say so at the top of each; the field pair
 * shares one FILE, which is the same rule with nothing left to get wrong.
 */
export const bundleArms: readonly TBundleArm[] = [
    {
        id: ARM_EVERYTHING,
        file: consumer('everything'),
        what: 'every name @oimdb/core exports, re-exported so nothing is droppable',
    },
    {
        id: ARM_DATABASE_ONLY,
        file: consumer('databaseOnly'),
        what: 'new OIMChannel() and nothing else — the toll every consumer pays',
    },
    {
        id: ARM_WITHOUT,
        file: consumer('withoutOrderedList'),
        what: 'a channel, a population, a bucket collection, a write, an effect and a read',
    },
    {
        id: ARM_WITH,
        file: consumer('withOrderedList'),
        what: 'the same application, plus diffOrderedList over the same bucket',
    },
    {
        id: ARM_GROUPING_NONE,
        file: consumer('groupingNone'),
        what: 'a channel, a population, a write, an effect and a read — no index at all',
    },
    {
        id: ARM_GROUPING_LAYER_PINNED,
        file: consumer('groupingLayerPinned'),
        what: 'the same consumer, holding the three bodies a collection method would have named',
    },
    {
        id: ARM_GROUPING_ONE,
        file: consumer('groupingOne'),
        what: 'the same consumer, taking one bucket collection and reading one unordered group',
    },
    {
        id: ARM_GROUPING_ONE_SHARED_MODULE,
        file: consumer('groupingOneSharedModule'),
        what: 'the same caller, holding the other identity store a shared resolver could not withhold',
    },
    {
        id: ARM_GROUPING_ONE_ORDER_OPTION,
        file: consumer('groupingOneOrderOption'),
        what: 'the same caller, holding the ordered bucket service an `order?` ternary would have named',
    },
    {
        id: ARM_FIELD_FLOOR,
        file: consumer('fieldFloor'),
        what:
            'a channel, a population, a bucket service, a batch, two effects and a write — '
            + 'no column slot asked for anywhere',
    },
    /* eslint-disable-next-line -- kept adjacent to its pair; see the header above. */
    {
        /**
         * THE SAME FILE as `field-floor`, not a copy of it — so the two readings
         * differ in the engine and in nothing else. What this arm removes is in
         * `fieldMachineryExcision.ts`.
         */
        id: ARM_FIELD_LIFTED,
        file: consumer('fieldFloor'),
        what:
            'the identical application against an engine where the column apparatus is not '
            + 'reachable — a counterfactual build, not a package anybody can install',
        excision: fieldMachineryExcision,
    },
];

/**
 * The arms a piece asked for, REFUSING rather than skipping on a name that is
 * not in the catalogue: a report missing one side of a difference is not a
 * smaller report — the rule `TBundleRun` states about an arm that threw.
 */
export const armsOf = (ids: readonly string[]): readonly TBundleArm[] =>
    ids.map(id => {
        const arm = bundleArms.find(one => one.id === id);
        if (arm === undefined) throw new Error(`bundle: no arm named "${id}"`);
        return arm;
    });
