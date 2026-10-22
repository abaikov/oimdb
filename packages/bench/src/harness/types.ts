import type { TConsumers, TGroupConsumers } from './consumer';
import type { TOwner, TPairRow, TPlan, TRow } from './dataset';
import type { BenchOracle } from './oracle';
import type { TStandardStanding } from './standard';

// What an adapter provides, and what it is NOT allowed to provide. The SCRIPTS live in
// the harness, never in an adapter: it never decides what is written, how many times, in
// what order, or when a consumer runs.
export type TBinding = {
    // Also every step of the re-send scenario, whose values equal what is stored. AN
    // ADAPTER MAY NOT SUPPLY A VALUE CHECK ITS LIBRARY DOES NOT.
    write(rows: readonly TRow[]): void;
    remove(ids: readonly string[]): void;
    patchLabel(id: string, label: string): void;
    patchNote(id: string, note: string): void;
    setGroup(id: string, group: string): void;
    setRank(id: string, rank: number): void;
    // Once, untimed. WHAT MAY BE KEPT is what the library hands back for a key, never
    // the values — that would be storing.
    pin(cells: TCellConfig): void;
    patchPinnedLabel(at: number, label: string): void;
    patchPinnedNote(at: number, note: string): void;
    // Runs a script's writes of one frame inside the library's OWN batching API
    // (`batch`, `runInAction`, `transaction`, …), or directly where it has none.
    frame(run: () => void): void;
    // The frame's commit, as a renderer's rAF is: it paints exactly what the store's own
    // observers marked during the frame, and nothing they did not — see BENCHMARKING.md, "What a cell is".
    settle(): void;
    // READ THROUGH THE LIBRARY, never from the adapter's own bookkeeping: that would
    // pass the audit while the store beneath had lost the write.
    readAll(): readonly TRow[];
    // The WHOLE bucket, not the window. `undefined` is an answer, not an exemption.
    groupOrder(group: string): readonly string[] | undefined;
    // WITHOUT DELIVERING, and holding THE SAME OBJECTS: a spread into plain objects
    // answers for a shape nothing renders.
    deliverableRows(at: number): readonly TRow[] | undefined;
    dispose(): void;
};

export type TViewConfig = {
    groupA: string;
    groupB: string;
    window: number;
};

// Not "which rows are on screen" but "when one column of one row changes, who wakes".
// `ranks` IS NOT A COLUMN AN ADAPTER READS.
export type TCellConfig = {
    ids: readonly string[];
    ranks: readonly number[];
};

// Built with NO VIEWS AT ALL, and every subscriber reads `plan.churnRows[0]` whichever
// shape mounted it — which is what lets one write wake all of them.
export type TChurnBinding = TBinding & {
    holdChurnRows(ids: readonly string[], ranks: readonly number[]): void;
    mountOnRows(at: number, from: number, count: number): void;
    // A LIBRARY WITH NO COLUMN IDENTITY DECLINES `churn.column`: implementing this as a
    // row subscription would print the neighbouring table's operation under this name.
    mountOnColumn(at: number): void;
    // Level k derives `chainLevelOf(level k−1, k)` (`derivations.ts`), so the head's text
    // proves how many levels ran; the subscriber renders the head.
    mountOnChain(
        at: number,
        from: number,
        count: number,
        depth: number
    ): void;
    // Two derivations over root row `from` (`diamondLeftOf`, `diamondRightOf`), one
    // over both (`diamondJoinOf`), the subscriber on the join: it must run ONCE per frame.
    mountOnDiamond(at: number, from: number): void;
    unmount(at: number): void;
};

// REQUIRED, NOT OPTIONAL: an optional builder lets a library be absent from a row
// without saying so. `registry.ts` refuses a declaration setting both or neither.
export type TWiring<TBound> = {
    build:
        | ((consumers: TConsumers, view: TViewConfig, plan: TPlan) => TBound)
        | undefined;
    absent: string;
};

const supplyOrDecline = <TBound>(
    build: (consumers: TConsumers, view: TViewConfig, plan: TPlan) => TBound,
    absent: string | undefined
): TWiring<TBound> =>
    absent === undefined || absent.length === 0
        ? { build, absent: '' }
        : { build: undefined, absent };

export type TChurnShapeKey = 'row' | 'wide' | 'column' | 'chain' | 'diamond';

export const CHURN_SHAPES: readonly TChurnShapeKey[] = [
    'row',
    'wide',
    'column',
    'chain',
    'diamond',
];

// ONE DECLARATION PER MOUNT SHAPE AND NOT ONE PER FAMILY.
export type TChurnEntry = Readonly<Record<TChurnShapeKey, TWiring<TChurnBinding>>>;

export const noChurn = (absent: string): TChurnEntry => ({
    row: { build: undefined, absent },
    wide: { build: undefined, absent },
    column: { build: undefined, absent },
    chain: { build: undefined, absent },
    diamond: { build: undefined, absent },
});

export const churnShapes = (
    build: (
        consumers: TConsumers,
        view: TViewConfig,
        plan: TPlan
    ) => TChurnBinding,
    declined: Partial<Record<TChurnShapeKey, string>> = {}
): TChurnEntry => ({
    row: supplyOrDecline(build, declined.row),
    wide: supplyOrDecline(build, declined.wide),
    column: supplyOrDecline(build, declined.column),
    chain: supplyOrDecline(build, declined.chain),
    diamond: supplyOrDecline(build, declined.diamond),
});

// IT THROWS RATHER THAN SUBSCRIBING TO SOMETHING ELSE.
export const declinedMount =
    (adapter: string, shape: TChurnShapeKey) =>
    (): never => {
        throw new Error(
            `${adapter} declines the ${shape} churn shape and has no row in that table; the reason ` +
                `is in \`churn.${shape}.absent\`.`
        );
    };

// BOTH VIEWS ARE OVER GROUP A. Every method on `TBinding` is a WRITE.
export type TReadBinding = TBinding & {
    // THE LOOKUP IS THE MEASUREMENT, so these keys may not be resolved in advance — the
    // exact opposite of `pin`. All three columns come out of the store.
    readKeys(from: number, count: number): void;
    // THIS IS NOT A RE-SORT AND MAY NOT BE IMPLEMENTED AS ONE. It MARKS rather than
    // delivers, so a scroll step is one frame.
    scrollTo(offset: number): void;
    // The VIEW'S DEFINITION changes — a user switching tab or filter: view A re-points to
    // `group`, window at offset 0. Marks, like `scrollTo`; the settle delivers.
    switchGroup(group: string): void;
};

export type TReadShapeKey = 'byKey' | 'byWindow' | 'byTwoAxes' | 'bySwitch';

export const READ_SHAPES: readonly TReadShapeKey[] = [
    'byKey',
    'byWindow',
    'byTwoAxes',
    'bySwitch',
];

export type TReadEntry = Readonly<Record<TReadShapeKey, TWiring<TReadBinding>>>;

export const noReads = (absent: string): TReadEntry => ({
    byKey: { build: undefined, absent },
    byWindow: { build: undefined, absent },
    byTwoAxes: { build: undefined, absent },
    bySwitch: { build: undefined, absent },
});

export const readShapes = (
    build: (
        consumers: TConsumers,
        view: TViewConfig,
        plan: TPlan
    ) => TReadBinding,
    declined: Partial<Record<TReadShapeKey, string>> = {}
): TReadEntry => ({
    byKey: supplyOrDecline(build, declined.byKey),
    byWindow: supplyOrDecline(build, declined.byWindow),
    byTwoAxes: supplyOrDecline(build, declined.byTwoAxes),
    bySwitch: supplyOrDecline(build, declined.bySwitch),
});

// ALL ADDRESS AND NO CONTENT. `owners` is derived from the key, so it is IMMUTABLE.
export type TRelationConfig = {
    ids: readonly string[];
    ranks: readonly number[];
    owners: readonly string[];
    touched: readonly string[];
    names: readonly string[];
    seeds: readonly string[];
};

// A WRITE TO ONE TYPE WAKING A VIEW BUILT OVER ANOTHER — the operation a single-type
// suite structurally cannot contain. No view is derived here.
export type TRelationBinding = TBinding & {
    writeOwners(owners: readonly TOwner[]): void;
    // WHAT MAY NOT BE KEPT IS THE PAIR ADDRESS: the segments are resolved here, the key
    // is composed per call. It creates the pair records and delivers both views once.
    holdRelation(config: TRelationConfig): void;
    patchOwnerName(at: number, name: string): void;
    // THE COMPOSITION IS THE MEASUREMENT: the pair address does not exist until this call
    // builds it out of two identities. NEITHER ARM MAY CACHE THE COMPOSED KEY.
    writePair(at: number, mark: string): void;
    readOwners(): readonly TOwner[];
    // THE ONLY WITNESS THE COMPOSITE-KEY ROW HAS: a mark in the wrong pair renders right.
    readPairs(): readonly TPairRow[];
};

export type TRelationEntry = TWiring<TRelationBinding>;

export const noRelations = (absent: string): TRelationEntry => ({
    build: undefined,
    absent,
});

// THE SECOND IS NEVER WRITTEN: it is there to be silent.
export type TSingleConfig = {
    name: string;
    bystander: string;
    seeds: readonly string[];
};

// No key, no collection, no window, no grouping, no rows — the row-store half is
// `noRowStore`. B is not there to be right, it is there to be WOKEN OR NOT.
export type TSingleBinding = TBinding & {
    holdSingle(config: TSingleConfig): void;
    // AN ADAPTER MAY NOT SUPPLY A VALUE CHECK ITS LIBRARY DOES NOT, as `write` forbids.
    writeSingle(value: string): void;
    // The only thing separating "correctly woke nobody" from "dropped the write".
    readSingle(): string;
    readBystander(): string;
};

export type TSingleEntry = TWiring<TSingleBinding>;

export const noSingle = (absent: string): TSingleEntry => ({
    build: undefined,
    absent,
});

// THEY THROW RATHER THAN ANSWERING EMPTILY: an empty answer would make a binding that
// dropped every row look like one correctly never asked, and both would pass the audit.
export const noRowStore = (
    adapter: string
): Omit<TBinding, 'frame' | 'settle' | 'dispose'> => {
    const refuse =
        (method: string) =>
        (): never => {
            throw new Error(
                `${adapter}: \`${method}\` was called on a SINGLE wiring. That wiring holds one value ` +
                    'and a second beside it, no rows, no keys and no grouping, and no script of the ' +
                    'single family calls this method. Reaching it means a worker was driven through a ' +
                    'script this binding was not built for.'
            );
        };
    return {
        write: refuse('write'),
        remove: refuse('remove'),
        patchLabel: refuse('patchLabel'),
        patchNote: refuse('patchNote'),
        setGroup: refuse('setGroup'),
        setRank: refuse('setRank'),
        pin: refuse('pin'),
        patchPinnedLabel: refuse('patchPinnedLabel'),
        patchPinnedNote: refuse('patchPinnedNote'),
        readAll: refuse('readAll'),
        groupOrder: refuse('groupOrder'),
        deliverableRows: refuse('deliverableRows'),
    };
};

export type TScenarioKey =
    | 'batchInsert'
    | 'patchColumn'
    | 'patchOutsideWindow'
    | 'patchNote'
    | 'batchPatch'
    | 'batchPatchNote'
    | 'patchMostRows'
    | 'mixedFrame'
    | 'moveGroup'
    | 'moveAndReorder'
    | 'sortKeyMove'
    | 'resortWindow'
    | 'consumerPerGroup'
    | 'cellDelivery'
    | 'deleteRows'
    | 'deleteOneRow'
    | 'drainGroup'
    | 'resendUnchanged'
    // THE SIX FLOORS, one per family — see `README.md#floor`. Each runs NO STORE.
    | 'consumerFloor'
    | 'mountFloor'
    | 'tearDownFloor'
    | 'cellFloor'
    | 'relationFloor'
    | 'singleFloor'
    | 'singleWrite'
    | 'singleResend'
    | 'churnOne'
    | 'churnShared'
    | 'churnSharedReversed'
    | 'churnSharedDeep'
    | 'churnSharedDeepReversed'
    | 'churnWide'
    | 'churnColumn'
    | 'churnList'
    | 'churnChain'
    | 'chainFrameWrite'
    | 'churnDiamond'
    | 'diamondFrameWrite'
    | 'churnResident'
    // THE APPLICATION FAMILY: data and subscribers move together, driven through
    // `churn.row` and needing no method `TChurnBinding` does not already have.
    | 'appFill'
    | 'appRound'
    | 'appSettingMove'
    | 'insertIntoPopulated'
    | 'growUnderSubscription'
    | 'coldStart'
    | 'tearDown'
    | 'readByKey'
    | 'scrollWindow'
    | 'deepScroll'
    | 'viewSwitch'
    | 'filterTwoAxes'
    | 'relationWrite'
    | 'compositeKeyWrite';

export type TAdapter = {
    name: string;
    version: string;
    docs: string;
    // REQUIRED, NOT OPTIONAL: `''` says "nothing to declare", where a missing field
    // leaves that indistinguishable from "nobody looked".
    departure: string;
    // Where the values live and what emits the change signal — `TExcludedLibrary`'s
    // admission rule, answered by the row it admits. Required, for `departure`'s reason.
    admission: string;
    bind: (consumers: TConsumers, view: TViewConfig, plan: TPlan) => TBinding;
    // THE SAME BODY MUST SERVE BOTH: a per-group binding on a different strategy would
    // make this row a comparison of wirings printed as one of libraries.
    bindPerGroup: (
        consumers: TGroupConsumers,
        view: TViewConfig,
        plan: TPlan
    ) => TBinding;
    churn: TChurnEntry;
    reads: TReadEntry;
    relations: TRelationEntry;
    single: TSingleEntry;
    // Kept out of the digest-agreement pass: a control must not void a scenario.
    isControl?: boolean;
};

// THE RULE, applied to every row: a library is measured here when it OWNS THE DATA and
// emits a CHANGE SIGNAL for it, both halves its own. A key lookup is not storage.
export type TExcludedLibrary = {
    name: string;
    version: string;
    docs: string;
    reason: string;
};

export type TScenarioContext = {
    binding: TBinding;
    consumers: TConsumers;
    groupConsumers: TGroupConsumers;
    rows: readonly TRow[];
    rowById: ReadonlyMap<string, TRow>;
    plan: TPlan;
    view: TViewConfig;
    cells: TCellConfig;
    // THE HARNESS NEVER HANDS AN ADAPTER ITS OWN ROW OBJECTS: several stores keep what
    // they are given, so a patch would rewrite the dataset the harness restores from.
    loadRows: readonly TRow[];
    resendCopies: readonly TRow[][];
    deletedRows: readonly TRow[];
    floorRows: readonly TRow[];
    // IT IS WHAT SUPPLIES DISTINCTNESS: two adjacent deliveries render different groups.
    floorRowsB: readonly TRow[];
    churn: TChurnBinding | undefined;
    read: TReadBinding | undefined;
    relation: TRelationBinding | undefined;
    single: TSingleBinding | undefined;
    singleConfig: TSingleConfig;
    owners: readonly TOwner[];
    relationConfig: TRelationConfig;
    insertRows: readonly TRow[];
    // The only place here where constructing a store is inside a timed region. IT THROWS
    // IF A STORE IS STILL STANDING, or cold start would silently time a teardown too.
    newBinding(): void;
    dropBinding(): void;
};

export type TScenario = {
    key: TScenarioKey;
    label: string;
    description: string;
    // Required, and every item required inside it; a NOT MET with no reason throws.
    standing: TStandardStanding;
    steps: number;
    rebuild: boolean;
    // Built with `bindPerGroup` and judged on the fifty; the counters are their SUM.
    perGroup?: true;
    // THE SHAPE AND NOT A FLAG, because the decline is per shape.
    churn?: TChurnShapeKey;
    read?: TReadShapeKey;
    relation?: true;
    // The untimed load DOES NOT RUN — the row-store methods throw — and the audit reads
    // the two VALUES back.
    single?: true;
    // For a script that builds the store ITSELF inside its own timed region.
    fromEmpty?: true;
    // The population audit is skipped; the PROOF FRAME afterwards stands in for it.
    populationDestroyed?: true;
    // Restates the script's own `check` as DATA, because the floor column cannot read a
    // function. It says nothing about `deliveries`: waking redundantly is permitted.
    rendersNothing?: true;
    // Get this wrong and the second pass writes values the store already holds — the
    // timing loop then measures the no-op path and reports it as the write path.
    repeatable: boolean;
    prepare(ctx: TScenarioContext): void;
    restore(ctx: TScenarioContext): void;
    run(ctx: TScenarioContext): void;
    // Where "the consumer was forced" is enforced: a script writing 32 distinct states
    // demands 32 distinct renders, so a store that deferred them is FAILED, not fast.
    check(ctx: TScenarioContext): string | undefined;
    // IT IS NOT A BATCH SIZE: a script settling per WRITE keeps the sequence digest,
    // because there coalescing IS a skipped state. The population audit is unchanged.
    finalStateOnly?: true;
    // Verify and proof passes then fold EVERY standing subscriber's read into the churn
    // line (`foldChurnReads`), so a subscriber on the wrong source fails; timing is untouched.
    auditChurnReads?: true;
    // WRITTEN FROM THE SCRIPT AND NOT FROM WHAT THE ADAPTERS DO: an oracle read off the
    // adapters cannot disagree with them. Verify pass only, never timed.
    oracle(ctx: TScenarioContext, model: BenchOracle): void;
};

export const wiringNameOf = (scenario: TScenario): string =>
    scenario.churn !== undefined
        ? `churn.${scenario.churn}`
        : scenario.read !== undefined
          ? `reads.${scenario.read}`
          : scenario.relation === true
            ? 'relations'
            : scenario.single === true
              ? 'single'
              : '';

export const wiringFor = (
    adapter: TAdapter,
    scenario: TScenario
): TWiring<unknown> =>
    scenario.churn !== undefined
        ? adapter.churn[scenario.churn]
        : scenario.read !== undefined
          ? adapter.reads[scenario.read]
          : scenario.relation === true
            ? adapter.relations
            : scenario.single === true
              ? adapter.single
              : { build: adapter.bind, absent: '' };
