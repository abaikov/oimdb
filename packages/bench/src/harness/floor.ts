// WHAT A ROW IS A MULTIPLE OF: a floor scenario drives the harness's own consumer
// with no store underneath, and a row's multiple is `row.min / (steps × perStepMs)`.
// ONE FLOOR PER STEP SHAPE — a churn step, a teardown, a cell page, a relation, a
// single value and a silent step are not the same delivery. The two remaining
// biases, why the multiple is `≤` and never a subtraction, why `mountFloor` bounds
// nothing are in `README.md#floor`.
import type { BenchConsumer } from './consumer';
import type { TRow } from './dataset';
import type { TMeasuredRecord } from './pieces';
import type { TScenario, TScenarioKey } from './types';

// A READING CONVENTION, NOT A MEASUREMENT: at multiple m the store's own work is at
// most (m−1)/m of the printed time, and 3 is the smallest multiple at which the
// shared consumer part cannot turn a real ordering into a tie on its own. It decides
// a CAVEAT and never a place.
export const MOSTLY_HARNESS_UNDER_THIS_FLOOR_MULTIPLE = 3;

// `adapter` and `steps` travel with the number because the bound is FOR that storage
// shape over that many deliveries; quoting it alone makes it read as a constant of
// the machine.
export type TConsumerFloor = {
    perStepMs: number;
    adapter: string;
    steps: number;
    totalMs: number;
};

export type TStepDelivery =
    | 'window'
    | 'mount'
    | 'frame'
    | 'teardown'
    | 'cell'
    | 'relation'
    | 'single'
    | 'nothing';

// Enumerated so a shape with neither a floor nor a reason fails loudly.
export const STEP_DELIVERIES: readonly TStepDelivery[] = [
    'window',
    'mount',
    'frame',
    'teardown',
    'cell',
    'relation',
    'single',
    'nothing',
];

// The floors' half of the pairing; `standard.ts` checks `BOUND_BY` is its inverse.
// One table would make that check a reading of itself.
export const FLOOR_STEP_DELIVERY: ReadonlyMap<TScenarioKey, TStepDelivery> =
    new Map<TScenarioKey, TStepDelivery>([
        ['consumerFloor', 'window'],
        ['mountFloor', 'mount'],
        ['tearDownFloor', 'teardown'],
        ['cellFloor', 'cell'],
        ['relationFloor', 'relation'],
        ['singleFloor', 'single'],
    ]);

export const FLOOR_SCENARIO_KEYS: readonly TScenarioKey[] = [
    ...FLOOR_STEP_DELIVERY.keys(),
];

export const isFloorScenario = (scenario: TScenario): boolean =>
    FLOOR_SCENARIO_KEYS.includes(scenario.key);

export const STANDING_FRAME_SCENARIO_KEYS: readonly TScenarioKey[] = [
    'chainFrameWrite',
    'diamondFrameWrite',
    'appSettingMove',
];

// Keyed by the WIRING FLAGS, which already decide which builder a script is driven
// through; `rendersNothing` is the one field here no builder reads.
export const stepDeliveryOf = (scenario: TScenario): TStepDelivery => {
    const own = FLOOR_STEP_DELIVERY.get(scenario.key);
    if (own !== undefined) return own;
    if (scenario.rendersNothing === true) return 'nothing';
    if (STANDING_FRAME_SCENARIO_KEYS.includes(scenario.key)) return 'frame';
    if (scenario.churn !== undefined) return 'mount';
    if (scenario.relation === true) return 'relation';
    if (scenario.single === true) return 'single';
    if (scenario.key === 'cellDelivery') return 'cell';
    if (scenario.populationDestroyed === true) return 'teardown';
    return 'window';
};

// Two shapes are absent, and an absence here is a decision: those tables print
// `no floor` rather than a multiple.
const BOUND_BY: ReadonlyMap<TStepDelivery, TScenarioKey> = new Map<
    TStepDelivery,
    TScenarioKey
>([
    ['window', 'consumerFloor'],
    ['teardown', 'tearDownFloor'],
    ['cell', 'cellFloor'],
    ['relation', 'relationFloor'],
    ['single', 'singleFloor'],
]);

// Printed above the tables it concerns, so a reader meets the absence with its
// reason rather than an empty column.
export const UNBOUNDED_BECAUSE: ReadonlyMap<TStepDelivery, string> = new Map<
    TStepDelivery,
    string
>([
    [
        'mount',
        'a mount and an unmount have no lower bound in this report. `mountFloor` measures the pair ' +
            'with no library at all, and rows of the churn tables come out UNDER it — eight of ' +
            'eighteen on `churnShared`, seven of seventeen on `churnSharedDeep`, `control-heavy` ' +
            'among them. Its per-mount bookkeeping is what makes it beatable: a closure, a list slot ' +
            'and two side-array slots to record the position, and five array operations to leave, ' +
            'bought so that the unmount is an O(1) swap-remove rather than the anchor\'s `indexOf` ' +
            'plus `splice`. A number something beat is not a bound, so nothing here divides these ' +
            'rows. The `mount lower bound` table is still measured and still printed: what one mount ' +
            'and one unmount cost with no library is a figure, it is just not a floor.',
    ],
    [
        'frame',
        'a step here MOUNTS NOTHING: every subscriber stood before the clock, and a step is one ' +
            'write, every standing body that reads it, and ONE formatted churn line. `mountFloor` is ' +
            'not a bound on that — its step is a mount and an unmount, and the frame is amortised ' +
            'inside it — and no floor scenario measures a frame through standing subscribers with ' +
            'the library taken out, so these tables print `no floor`. The consumer share of a step ' +
            'is that one line, the same line on every row of the table.',
    ],
    [
        'nothing',
        'a correct store DELIVERS NOTHING here — both views end with no distinct render, which is ' +
            'what this script\'s own `check` demands — so there is no delivery every row of the table ' +
            'pays alike and nothing for a floor to be measured at. The rows that DO wake here pay a ' +
            'consumer share that is theirs and not the column\'s, and this report does not take it out ' +
            'of them; that is what these scripts\' B4 says in as many words.',
    ],
]);

export const whyNoFloor = (delivery: TStepDelivery): string | undefined =>
    UNBOUNDED_BECAUSE.get(delivery);

// A floor scenario maps to ITSELF, so its own multiple is 1.00 and says so: scaling
// it by another shape's floor would print a number about two measurements.
export const floorKeyFor = (scenario: TScenario): TScenarioKey | undefined =>
    isFloorScenario(scenario)
        ? scenario.key
        : BOUND_BY.get(stepDeliveryOf(scenario));

// False for the floors themselves: their multiple is 1.00 against themselves by
// construction.
export const floorIsABoundOn = (scenario: TScenario): boolean =>
    !isFloorScenario(scenario);

// Nothing when the piece is absent, void or produced no row: a missing floor is
// printed as missing, never invented from another point or a constant.
export const consumerFloorOf = (
    row: TMeasuredRecord | undefined,
    steps: number | undefined
): TConsumerFloor | undefined => {
    if (row === undefined) return undefined;
    if (steps === undefined || steps <= 0) return undefined;
    if (!(row.min > 0)) return undefined;
    return {
        perStepMs: row.min / steps,
        adapter: row.name,
        steps,
        totalMs: row.min,
    };
};

export const floorMultipleOf = (
    minMs: number,
    steps: number | undefined,
    floor: TConsumerFloor | undefined
): number | undefined => {
    if (floor === undefined) return undefined;
    if (steps === undefined || steps <= 0) return undefined;
    const expected = steps * floor.perStepMs;
    if (!(expected > 0)) return undefined;
    return minMs / expected;
};

// `no floor` rather than a blank, because a blank column reads as a small multiple.
// EVERY CELL CARRIES `≤` AND THE MARK IS NEVER TWO-VALUED: the view count makes the
// multiple an over-estimate on every row, and a `≤` on some cells only would invite
// subtraction on the others.
export const formatFloorColumn = (
    multiple: number | undefined,
    marked: boolean
): string => {
    if (multiple === undefined) return '    no floor ';
    const value = multiple >= 100 ? multiple.toFixed(0) : multiple.toFixed(2);
    return `${`≤${value}×`.padStart(7)} floor${marked ? '‼' : ' '}`;
};

// Decided in one place so the table and its footnote cannot disagree.
export const floorBound = (
    multiple: number | undefined,
    markable: boolean
): boolean =>
    markable &&
    multiple !== undefined &&
    multiple < MOSTLY_HARNESS_UNDER_THIS_FLOOR_MULTIPLE;

// THE SHAPE AUDIT: the one check between `deliverableRows` and a floor measured over
// a shape nothing renders. The snapshot order and the by-id comparison are load-
// bearing — `README.md#floor`. Untimed, in the verify pass, BEFORE any floor is measured.
export const firstDeliveredShapeMismatch = (
    binding: { deliverableRows(at: number): readonly TRow[] | undefined },
    views: readonly BenchConsumer[]
): string | undefined => {
    for (let at = 0; at < views.length; at++) {
        const witness = views[at].deliveredRows();
        // No window delivery reached this consumer.
        if (witness === undefined) continue;
        // Snapshotted BEFORE the call: both implementations return a buffer the
        // delivery path reuses, so a later snapshot could never fail.
        const delivered = new Map<string, TRow>();
        for (let i = 0; i < witness.length; i++) delivered.set(witness[i].id, witness[i]);
        const offered = binding.deliverableRows(at);
        // Declining is a true answer, as it is for `firstGroupingMismatch`.
        if (offered === undefined) continue;
        let matched = 0;
        for (let i = 0; i < offered.length; i++) {
            const row = offered[i];
            const held = delivered.get(row.id);
            if (held === undefined) continue;
            matched++;
            if (held === row) continue;
            return (
                `view ${at}, row ${row.id}: deliverableRows returned a DIFFERENT OBJECT from the ` +
                'one the delivery path passed. The method must READ the delivery path, not derive ' +
                'beside it — a floor measured over this array would be a floor for a shape nothing ' +
                'renders.'
            );
        }
        if (matched === 0 && offered.length > 0 && witness.length > 0) {
            return (
                `view ${at}: deliverableRows offered ${offered.length} rows and the last delivery ` +
                `into consumer ${views[at].name} passed ${witness.length}, and they share no id. ` +
                'The method is answering for a different view than the one that delivered.'
            );
        }
    }
    return undefined;
};
