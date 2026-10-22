import type { TLoadSummary } from '../harness/load';
import type { TSamplingPlan } from '../harness/measure';
import type { TCounterRecord } from '../harness/pieces';
import type { TScenarioKey } from '../harness/types';

export type TPointKey = 'default' | 'wide' | 'small';

export type TPoint = {
    key: TPointKey;
    n: number;
    window: number;
    processes: number;
};

export type TCellKey = {
    point: TPointKey;
    scenario: TScenarioKey;
    adapter: string;
};

export type TFingerprint = {
    harness: string;
    adapter: string;
    subject: string;
    libraries: Readonly<Record<string, string>>;
};

export type TEnvironment = {
    node: string;
    machine: string;
    host: string;
};

export type TPlanRecord = {
    format: 2;
    point: TPoint;
    scenario: TScenarioKey;
    plan: TSamplingPlan;
    probes: readonly { name: string; runMs: number }[];
    probeFailures: readonly { name: string; reason: string }[];
    probedAt: string;
    harness: string;
};

export type TControlPairReading = {
    gap: number;
    drift: number;
    resolved: boolean;
};

export type TResolution = TControlPairReading & {
    leanMin: number;
    heavyMin: number;
    fine: (TControlPairReading & { writeMin: number }) | undefined;
};

export type TAnchorReading = {
    name: string;
    min: number;
    drift: number;
};

export type TBatchRecord = {
    id: string;
    point: TPoint;
    scenario: TScenarioKey;
    adapterNames: readonly string[];
    startedAt: string;
    seconds: number;
    load: TLoadSummary;
    gcMissing: boolean;
    resolution: TResolution | undefined;
    anchor: TAnchorReading | undefined;
};

export type TMeasuredOutcome = {
    status: 'measured';
    min: number;
    processMins: readonly number[];
    drift: number;
    lost: number;
    spread: number;
    repeat: number;
    samples: number;
    warmed: number | undefined;
    a: TCounterRecord;
    b: TCounterRecord;
    ratioToAnchor: number | undefined;
};

export type TCellOutcome =
    | TMeasuredOutcome
    | { status: 'disagrees'; signature: string; oracle: string }
    | { status: 'failed'; phase: 'verify' | 'time'; reason: string };

export type TCellRecord = {
    format: 2;
    key: TCellKey;
    fingerprint: TFingerprint;
    environment: TEnvironment;
    plan: TSamplingPlan;
    batch: TBatchRecord;
    outcome: TCellOutcome;
    measuredAt: string;
};

export type TStaleReason =
    | 'harness'
    | 'adapter'
    | 'subject'
    | 'library'
    | 'plan'
    | 'point'
    | 'environment';

export type TCellState =
    | { status: 'declined'; reason: string }
    | { status: 'missing' }
    | { status: 'stale'; reasons: readonly TStaleReason[]; record: TCellRecord }
    | { status: 'fresh'; record: TCellRecord };

export type TCellStatus = {
    key: TCellKey;
    state: TCellState;
};
