import {
    OIMDB,
    OIMSlotReleasePolicyAfterIdle,
    OIMSlotReleasePolicyAfterUnhold,
    OIMSlotReleasePolicyAfterWrite,
    OIMSlotReleasePolicyAtEmpty,
    OIMSlotReleasePolicyAtUnhold,
    OIMSlotReleasePolicyEarliest,
    OIMSlotReleasePolicyNever,
} from '../../../index';
import type { IOIMSlotReleasePolicy, TOIMSlot } from '../../../index';

const getNowMs = (): number => 1_000_000;
const releaseTimer = (): (() => void) => () => undefined;

const POLICIES: [string, () => IOIMSlotReleasePolicy, boolean][] = [
    ['at empty', () => new OIMSlotReleasePolicyAtEmpty(), false],
    ['never', () => new OIMSlotReleasePolicyNever(), false],
    ['at unhold', () => new OIMSlotReleasePolicyAtUnhold(), false],
    ['after unhold', () => new OIMSlotReleasePolicyAfterUnhold({ keepAfterUnholdMs: 1_000 }), false],
    ['after write', () => new OIMSlotReleasePolicyAfterWrite({ keepAfterWriteMs: 1_000 }), true],
    ['after idle', () => new OIMSlotReleasePolicyAfterIdle({ keepAfterIdleMs: 1_000 }), true],
    ['earliest of at empty and never', () => new OIMSlotReleasePolicyEarliest([
        new OIMSlotReleasePolicyAtEmpty(), new OIMSlotReleasePolicyNever(),
    ]), false],
    ['earliest of at empty and after write', () => new OIMSlotReleasePolicyEarliest([
        new OIMSlotReleasePolicyAtEmpty(), new OIMSlotReleasePolicyAfterWrite({ keepAfterWriteMs: 1_000 }),
    ]), true],
];

const writtenSlot = (): TOIMSlot => ({
    effects: undefined,
    changedAtRevision: 0,
    changedAtEpoch: 0,
    effectEdges: undefined,
    holdCount: 0,
    releaseDueAfterWriteMs: -1,
    releaseDueAfterIdleMs: -1,
    releaseDueAfterUnholdMs: -1,
    isEmpty: false,
    isReleased: false,
    owner: undefined,
    key: 'k',
    storeSlot: { channelSlot: new OIMDB({ getNowMs, releaseTimer }).defaultChannelSlot },
} as unknown as TOIMSlot);

const snapshotOf = (slot: TOIMSlot): string => JSON.stringify(slot, (key, value: unknown) => (key === 'storeSlot' ? undefined : value));

const doesAnythingOnWrite = (slotReleasePolicy: IOIMSlotReleasePolicy): boolean => {
    const slot = writtenSlot();
    const before = snapshotOf(slot);
    slotReleasePolicy.onSlotWritten(slot);
    const isDueAtOnce = slotReleasePolicy.onSlotIdle(slot);
    return isDueAtOnce || snapshotOf(slot) !== before;
};

describe('which policy schedules a release on write', () => {
    it.each(POLICIES)('%s answers schedulesReleaseOnWrite', (_, slotReleasePolicyFor, schedulesReleaseOnWrite) => {
        expect(slotReleasePolicyFor().schedulesReleaseOnWrite).toBe(schedulesReleaseOnWrite);
    });

    it.each(POLICIES)('%s says false exactly when onSlotWritten and onSlotIdle do nothing to a written slot', (_, slotReleasePolicyFor) => {
        const slotReleasePolicy = slotReleasePolicyFor();
        expect(doesAnythingOnWrite(slotReleasePolicy)).toBe(slotReleasePolicy.schedulesReleaseOnWrite);
    });
});
