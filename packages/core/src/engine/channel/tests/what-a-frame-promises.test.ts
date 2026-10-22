
import { OIMSlotOwner } from '../../slot/OIMSlotOwner';
import { OIMDB } from '../../../factories/OIMDB';
import { OIMChannelService } from '../OIMChannelService';
import { OIMErrorPolicyThrowAtOnce } from '../../error/OIMErrorPolicyThrowAtOnce';
import { OIMEffectService } from '../../computed/OIMEffectService';
import type { TOIMEffect } from '../../computed/types/TOIMEffect';
import { createOIMEntitySlot } from '../../entity/utils/createOIMEntitySlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';

type Row = { n: number };

const channelService = OIMChannelService.INSTANCE;
const effectService = OIMEffectService.INSTANCE;

// A root slot and nothing else — no store, no maintainer. That is what a slot
// is at birth (`createOIMEntitySlot.ts:8-23`); every promise here is the frame's.
const makeSlot = (key: string): TOIMEntitySlot<Row, string> =>
    createOIMEntitySlot<Row, string>(key, new OIMSlotOwner());

/** The message of a throw, without asking what kind of throw it was. */
const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Run something that is expected to throw, and hand back what it threw. */
const catchThrow = (run: () => void): unknown => {
    try {
        run();
        return undefined;
    } catch (error) {
        return error;
    }
};

describe('a node is off its input the moment its detach is called', () => {
    it('stops running, and leaves the input with no dependent', () => {
        const db = new OIMDB();
        const source = makeSlot('source');
        let runs = 0;
        const effect = effectService.createEffect(db, [source], [], () => { runs++; });

        channelService.write(db.defaultChannelSlot, source);
        db.flush();
        expect(runs).toBe(1);

        // ONE OBJECT AND NOT TWO: what the door hands back IS the node in
        // `source.effects`, so `dispose` cannot be reached through a copy.
        expect((source.effects ?? [])[0]).toBe(effect);
        expect(effect.effectService).toBe(effectService);

        effectService.disposeEffect(effect);
        expect(source.effects?.length).toBe(0);

        channelService.write(db.defaultChannelSlot, source);
        db.flush();
        expect(runs).toBe(1);
    });
});

describe('when a node was born decides which frames it hears about', () => {
    it('gives a node born between frames none of the writes the open batch already made', () => {
        const db = new OIMDB();
        const slot = makeSlot('slot');

        channelService.write(db.defaultChannelSlot, slot);
        let runs = 0;
        effectService.createEffect(db, [slot], [], () => { runs++; });

        db.flush();
        expect(runs).toBe(0);

        channelService.write(db.defaultChannelSlot, slot);
        db.flush();
        expect(runs).toBe(1);
    });

    it('leaves a node born between frames unrun when the batch wrote nothing it reads', () => {
        const db = new OIMDB();
        const slot = makeSlot('slot');
        let runs = 0;
        effectService.createEffect(db, [slot], [], () => { runs++; });

        // Nothing inherited, nothing enlisted: a frame runs only what a write
        // put on its list.
        db.flush();
        expect(runs).toBe(0);

        channelService.write(db.defaultChannelSlot, slot);
        db.flush();
        expect(runs).toBe(1);
    });

    it('tells a node born inside a frame about the frames after it, and not that one', () => {
        const db = new OIMDB();
        let framesEnded = 0;
        channelService.subscribeAfterEachFlush(db.defaultChannelSlot, () => { framesEnded++; });
        const first = makeSlot('first');
        const second = makeSlot('second');

        let born: TOIMEffect | undefined;
        let bornRuns = 0;
        effectService.createEffect(db, [first], [], () => {
            if (born === undefined) {
                born = effectService.createEffect(db, [second], [], () => { bornRuns++; });
            }
        });

        channelService.write(db.defaultChannelSlot, first);
        db.flush();

        expect(born?.effectService).toBe(effectService);
        expect(bornRuns).toBe(0);

        // The frames that FOLLOW are its own.
        expect(framesEnded).toBe(1);
        channelService.write(db.defaultChannelSlot, second);
        db.flush();
        expect(bornRuns).toBe(1);
    });

    it('advances the revision on every write, above the per-frame coalescing guard', () => {
        const db = new OIMDB();
        const slot = makeSlot('slot');
        let runs = 0;
        effectService.createEffect(db, [slot], [], () => { runs++; });

        expect(db.defaultChannelSlot.clock.revision).toBe(0);
        channelService.write(db.defaultChannelSlot, slot);
        expect(db.defaultChannelSlot.clock.revision).toBe(1);
        expect(slot.changedAtRevision).toBe(1);

        // The second write of the frame returns before the dependent walk: the
        // guard skips the WALK, never the reading.
        channelService.write(db.defaultChannelSlot, slot);
        expect(db.defaultChannelSlot.clock.revision).toBe(2);
        expect(slot.changedAtRevision).toBe(2);

        db.flush();
        expect(runs).toBe(1);
    });
});

describe('a handler that throws costs its own body and nothing else', () => {
    it('runs the rest of the frame and hands the throw to the error policy', () => {
        const reported: string[] = [];
        const db = new OIMDB({ errorPolicy: { onErrorCaught: error => { reported.push(messageOf(error)); } } });
        const first = makeSlot('first');
        const second = makeSlot('second');

        effectService.createEffect(db, [first], [], () => { throw new Error('the first body threw'); });
        let secondRuns = 0;
        effectService.createEffect(db, [second], [], () => { secondRuns++; });

        channelService.write(db.defaultChannelSlot, first);
        channelService.write(db.defaultChannelSlot, second);

        expect(() => { db.flush(); }).not.toThrow();
        expect(secondRuns).toBe(1);
        expect(reported).toEqual(['the first body threw']);
    });

    it('hands every throw of the frame and of its tail to the policy, in the order they run', () => {
        const reported: string[] = [];
        const db = new OIMDB({ errorPolicy: { onErrorCaught: error => { reported.push(messageOf(error)); } } });
        const first = makeSlot('first');
        const second = makeSlot('second');

        effectService.createEffect(db, [first], [], () => { throw new Error('first'); });
        effectService.createEffect(db, [second], [], () => { throw new Error('second'); });
        let afterEachFrameRan = 0;
        channelService.subscribeAfterEachFrame(db.defaultChannelSlot, () => {
            afterEachFrameRan++;
            throw new Error('after each frame');
        });
        channelService.write(db.defaultChannelSlot, first);
        channelService.write(db.defaultChannelSlot, second);

        expect(() => { db.flush(); }).not.toThrow();
        expect(afterEachFrameRan).toBe(1);
        expect(reported).toEqual(['first', 'second', 'after each frame']);
    });

    it('contains an onBeforeFlush that throws, and opens the frame anyway', () => {
        const reported: string[] = [];
        const slot = makeSlot('slot');
        const db = new OIMDB({
            errorPolicy: { onErrorCaught: error => { reported.push(messageOf(error)); } },
            onBeforeFlush: () => {
                throw new Error('before the frame');
            },
        });
        let runs = 0;
        effectService.createEffect(db, [slot], [], () => { runs++; });
        channelService.write(db.defaultChannelSlot, slot);

        db.flush();
        expect(reported).toEqual(['before the frame']);
        expect(runs).toBe(1);
    });
});

describe('the after-each-frame phase is told once a frame, and disposal means disposal', () => {
    it('calls a handler once per frame, however little moved, until its disposer runs', () => {
        const db = new OIMDB();
        let calls = 0;
        const stop = channelService.subscribeAfterEachFrame(db.defaultChannelSlot, () => { calls++; });

        // An empty frame is still a frame.
        db.flush();
        expect(calls).toBe(1);
        db.flush();
        expect(calls).toBe(2);

        stop();
        db.flush();
        expect(calls).toBe(2);
    });

    it('does not call a handler added by a handler of the same phase until the next frame', () => {
        const db = new OIMDB();
        let addedCalls = 0;
        let added = false;
        channelService.subscribeAfterEachFrame(db.defaultChannelSlot, () => {
            if (added) return;
            added = true;
            channelService.subscribeAfterEachFrame(db.defaultChannelSlot, () => { addedCalls++; });
        });

        // The phase settles WHO it owes when it begins, so a subscription made
        // during a frame hears the frames after it and never that one.
        db.flush();
        expect(addedCalls).toBe(0);
        db.flush();
        expect(addedCalls).toBe(1);
    });

    it('silences a handler torn down by an earlier handler of the same walk', () => {
        const db = new OIMDB();
        let lateCalls = 0;
        const disposers: (() => void)[] = [];
        // Registered FIRST, so the walk reaches it first: the set is iterated in
        // insertion order.
        channelService.subscribeAfterEachFrame(db.defaultChannelSlot, () => { for (const dispose of disposers) dispose(); });
        disposers.push(channelService.subscribeAfterEachFrame(db.defaultChannelSlot, () => { lateCalls++; }));

        // The live `Set` is asked again before each call:
        // the buffer settles who the phase owes, not who is still live.
        db.flush();
        expect(lateCalls).toBe(0);
    });
});

describe('flush() answers a re-entrant call by which phase it arrived in', () => {
    it('refuses a flush() made from inside the frame, and names the way out', () => {
        const db = new OIMDB();
        const slot = makeSlot('slot');
        let refusal = '';
        effectService.createEffect(db, [slot], [], () => {
            refusal = messageOf(catchThrow(() => { db.flush(); }));
        });
        // A LATER BODY ON THE SAME LIST: a nested flush would have advanced the
        // frame number underneath the walk, so this one ran in an ended frame.
        let laterBodyRan = 0;
        effectService.createEffect(db, [slot], [], () => { laterBodyRan++; });

        let framesEnded = 0;
        channelService.subscribeAfterEachFlush(db.defaultChannelSlot, () => { framesEnded++; });
        channelService.write(db.defaultChannelSlot, slot);
        db.flush();

        expect(laterBodyRan).toBe(1);
        expect(framesEnded).toBe(1);
        // The refusal is `OIMChannelService.flush`'s own message, and the way out it
        // names is a method of that class.
        expect(refusal).toContain('a frame is already running');
        expect(refusal).toContain('a second one inside it would end the first');
        expect(refusal).toContain('subscribeAfterEachFrame');
    });

    it('leaves nothing set behind after a flush that threw', () => {
        const db = new OIMDB({ errorPolicy: new OIMErrorPolicyThrowAtOnce() });
        let frames = 0;
        channelService.subscribeAfterEachFrame(db.defaultChannelSlot, () => {
            frames++;
            if (frames > 1) return;
            db.flush();
            throw new Error('the tail threw');
        });

        expect(() => { db.flush(); }).toThrow('the tail threw');
        // The nested `flush()` above returned silently, because `isFlushing` was
        // already true: it never opened a second frame.
        expect(frames).toBe(1);

        // `flush`'s `finally` gives `isFlushing` back, so the next call is an
        // ordinary frame rather than a deferral into nothing.
        db.flush();
        expect(frames).toBe(2);
    });
});

describe('a write is refused for the whole of a flush, not only while the frame is delivering', () => {
    it('refuses one from a subscriber, because the delivery list has already been taken', () => {
        const db = new OIMDB();
        const slot = makeSlot('slot');
        let refusal = '';
        effectService.createEffect(db, [slot], [], () => {
            refusal = messageOf(catchThrow(() => { channelService.assertNotFlushing(db.defaultChannelSlot); }));
        });

        channelService.write(db.defaultChannelSlot, slot);
        db.flush();
        expect(refusal).toContain('writes are refused for the whole of a flush');
        expect(refusal).toContain('Write after flush() returns');
    });

    it('refuses one from before the frame and from the tail of it, and permits one after the flush returns', () => {
        const db = new OIMDB();
        let refusedBeforeFlush: boolean | undefined;
        let refusedInTail: boolean | undefined;
        const dbWithHooks: OIMDB = new OIMDB({
            onBeforeFlush: () => {
                refusedBeforeFlush = catchThrow(() => { channelService.assertNotFlushing(dbWithHooks.defaultChannelSlot); }) !== undefined;
            },
        });
        channelService.subscribeAfterEachFrame(dbWithHooks.defaultChannelSlot, () => {
            refusedInTail = catchThrow(() => { channelService.assertNotFlushing(dbWithHooks.defaultChannelSlot); }) !== undefined;
        });

        expect(() => { channelService.assertNotFlushing(db.defaultChannelSlot); }).not.toThrow();
        dbWithHooks.flush();

        // `isFlushing` is set before `onBeforeFlush` and cleared only after the
        // tail phases, so either callback's write is refused like the body's.
        expect(refusedBeforeFlush).toBe(true);
        expect(refusedInTail).toBe(true);
        expect(() => { channelService.assertNotFlushing(dbWithHooks.defaultChannelSlot); }).not.toThrow();
    });
});

describe('a channel given a scheduler asks it for a frame instead of running one', () => {
    it('asks once for the whole batch, and delivers only when the scheduler calls back', () => {
        const asked: (() => void)[] = [];
        const db = new OIMDB({ channelScheduler: (flush) => { asked.push(flush); } });
        const first = makeSlot('first');
        const second = makeSlot('second');
        let runs = 0;
        effectService.createEffect(db, [first, second], [], () => { runs++; });

        channelService.write(db.defaultChannelSlot, first);
        channelService.write(db.defaultChannelSlot, second);

        // One ask, however many identities are marked before the frame opens,
        // and nothing runs until it is taken.
        expect(asked).toHaveLength(1);
        expect(runs).toBe(0);

        asked[0]();
        expect(runs).toBe(1);

        // The flag is cleared when the frame it asked for opens,
        // so the next batch asks again.
        channelService.write(db.defaultChannelSlot, first);
        expect(asked).toHaveLength(2);
    });

    it('does nothing for a write to a slot nobody holds, so an effect born behind it hears only later writes', () => {
        const asked: (() => void)[] = [];
        const db = new OIMDB({ channelScheduler: (flush) => { asked.push(flush); } });
        const slot = makeSlot('slot');

        channelService.write(db.defaultChannelSlot, slot);
        expect(asked).toHaveLength(0);

        let runs = 0;
        effectService.createEffect(db, [slot], [], () => { runs++; });
        expect(asked).toHaveLength(0);

        channelService.write(db.defaultChannelSlot, slot);
        expect(asked).toHaveLength(1);

        asked[0]();
        expect(runs).toBe(1);
    });

    it('still runs a frame asked for by hand while a scheduler is installed', () => {
        const asked: (() => void)[] = [];
        const db = new OIMDB({ channelScheduler: (flush) => { asked.push(flush); } });
        const slot = makeSlot('slot');
        let runs = 0;
        effectService.createEffect(db, [slot], [], () => { runs++; });

        channelService.write(db.defaultChannelSlot, slot);
        db.flush();
        expect(runs).toBe(1);

        // The manual flush cancelled the schedule, so the outstanding wake is no
        // longer the scheduled callback and opens no frame.
        expect(asked).toHaveLength(1);
        asked[0]();
        expect(runs).toBe(1);
    });

    it('gives its request flag back when the scheduler throws, so the next write asks again', () => {
        let failNext = true;
        const asked: (() => void)[] = [];
        const db = new OIMDB({
            channelScheduler: (flush) => {
                if (failNext) throw new Error('the scheduler refused');
                asked.push(flush);
            },
        });
        const first = makeSlot('first');
        const second = makeSlot('second');
        let runs = 0;
        effectService.createEffect(db, [first, second], [], () => { runs++; });

        // The flag goes back and the throw still leaves: a database that took
        // the write and never delivered it is the silent version of this.
        expect(() => { channelService.write(db.defaultChannelSlot, first); }).toThrow('the scheduler refused');

        // A SECOND SLOT, because the first is already stamped for this frame and
        // a repeat write of it never reaches the scheduler at all.
        failNext = false;
        channelService.write(db.defaultChannelSlot, second);
        expect(asked).toHaveLength(1);
        asked[0]();
        expect(runs).toBe(1);
    });
});

// WHAT A BODY HANDS BACK. A returned function is the undo for THAT run: called
// before the next one and by `dispose`. Anything else returned is discarded.
describe('an effect undoes its last run before the next one and at detach', () => {
    it('runs the undo before the next body, in that order', () => {
        const db = new OIMDB();
        const slot = makeSlot('slot');
        const at: string[] = [];

        const effect = effectService.createEffect(db, [slot], [], () => {
            at.push('run');
            return () => { at.push('undo'); };
        });

        channelService.write(db.defaultChannelSlot, slot);
        db.flush();
        channelService.write(db.defaultChannelSlot, slot);
        db.flush();
        effectService.disposeEffect(effect);

        expect(at).toEqual(['run', 'undo', 'run', 'undo']);
    });

    it('discards a return that is not a function, so an expression body is unchanged', () => {
        const db = new OIMDB();
        const slot = makeSlot('slot');
        const seen = new Set<string>();

        // `Set.add` returns the `Set`, and an expression-bodied arrow hands it
        // back. Truthiness would call it; `typeof` does not.
        const body = (() => seen.add('key')) as unknown as () => void;
        const effect = effectService.createEffect(db, [slot], [], body);

        channelService.write(db.defaultChannelSlot, slot);
        db.flush();
        expect(() => { effectService.disposeEffect(effect); }).not.toThrow();
        expect(seen.has('key')).toBe(true);
    });

    it('clears the undo before calling it, so a throw is not replayed by detach', () => {
        const db = new OIMDB();
        const slot = makeSlot('slot');
        let undos = 0;

        const effect = effectService.createEffect(db, [slot], [], () => () => {
            undos++;
            throw new Error('undo failed');
        });

        channelService.write(db.defaultChannelSlot, slot);
        db.flush();

        expect(catchThrow(() => { effectService.disposeEffect(effect); })).toBeInstanceOf(Error);
        expect(undos).toBe(1);
        // The edges were taken out before the undo ran, so a second dispose has
        // nothing to undo and nothing to remove.
        effectService.disposeEffect(effect);
        expect(undos).toBe(1);
    });

    it('takes the edges out even when the undo throws, so the effect cannot run again', () => {
        const db = new OIMDB();
        const slot = makeSlot('slot');
        let runs = 0;

        const effect = effectService.createEffect(db, [slot], [], () => {
            runs++;
            return () => { throw new Error('undo failed'); };
        });

        channelService.write(db.defaultChannelSlot, slot);
        db.flush();
        expect(runs).toBe(1);

        catchThrow(() => { effectService.disposeEffect(effect); });
        channelService.write(db.defaultChannelSlot, slot);
        db.flush();
        expect(runs).toBe(1);
    });
});

describe('run() is unconditional, and runIfSourcesChanged() is the one that declines', () => {
    it('runs on a hand call with nothing changed since the last run', () => {
        const db = new OIMDB();
        const slot = makeSlot('slot');
        let runs = 0;
        const effect = effectService.createEffect(db, [slot], [], () => { runs++; });

        effectService.runEffect(effect);
        expect(runs).toBe(1);
        effectService.runEffect(effect);
        expect(runs).toBe(2);
    });

    it('TAKES THE FRAME\'S DELIVERY: a hand call between the write and the flush stamps', () => {
        const db = new OIMDB();
        const slot = makeSlot('slot');
        let runs = 0;
        const effect = effectService.createEffect(db, [slot], [], () => { runs++; });

        channelService.write(db.defaultChannelSlot, slot);
        // `run` is not a peek. It advances `ranAt*` past the write's revision,
        // and the flush then finds nothing changed since this effect last ran.
        effectService.runEffect(effect);
        expect(runs).toBe(1);

        db.flush();
        expect(runs).toBe(1);
    });

    it('declines a runIfSourcesChanged() after a delivery, and detach does not change that', () => {
        const db = new OIMDB();
        const slot = makeSlot('slot');
        let runs = 0;
        const effect = effectService.createEffect(db, [slot], [], () => { runs++; });

        channelService.write(db.defaultChannelSlot, slot);
        db.flush();
        expect(runs).toBe(1);

        // The gate, not the listing: the sources are compared against `ranAt*`,
        // which the flush just advanced. `dispose` never touches those.
        effectService.runEffectIfSourcesChanged(effect);
        expect(runs).toBe(1);
        effectService.disposeEffect(effect);
        effectService.runEffectIfSourcesChanged(effect);
        expect(runs).toBe(1);
    });
});
