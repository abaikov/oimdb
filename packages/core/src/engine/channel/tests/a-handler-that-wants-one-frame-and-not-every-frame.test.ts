import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { OIMChannelService } from '../OIMChannelService';
import type { TOIMEntitySlot, TOIMDisposer } from '../../../index';
import { OIMEffectService } from '../../../index';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';

type TRow = { id: string; n: number };
type TRowSlot = TOIMEntitySlot<TRow, TOIMStoreKey>;

const fixture = (caught?: (error: unknown) => void) => {
    const db = new OIMDB(caught === undefined ? undefined : { errorPolicy: { onErrorCaught: caught } });
    const channelService = OIMChannelService.INSTANCE;
    const channelSlot = db.defaultChannelSlot;
    const effectService = OIMEffectService.INSTANCE;
    const rowsService = createOIMEntityService<TRow>(db, { keyOf: (row) => row.id });
    const rows = rowsService.createStoreSlot(db);
    const slot = rowsService.slotContentService.upsertEntity(rows, { id: 'a', n: 0 });
    db.flush();
    let n = 0;
    /** One write and one frame — the unit every count below is per. */
    const frame = (): void => { rowsService.slotContentService.upsertEntity(rows, { id: 'a', n: ++n }); db.flush(); };
    return { db, channelService, channelSlot, effectService, slot, frame };
};

describe('a handler told after one frame', () => {
    it('runs after the frame that follows it, and never again', () => {
        const { channelService, channelSlot, frame } = fixture();
        let ran = 0;
        channelService.subscribeOnceAfterFrame(channelSlot, () => { ran++; });

        expect(ran).toBe(0);
        frame();
        expect(ran).toBe(1);
        frame();
        frame();
        expect(ran).toBe(1);
    });

    it('does not run at all if it is disposed before the frame', () => {
        const { channelService, channelSlot, frame } = fixture();
        let ran = 0;
        const off = channelService.subscribeOnceAfterFrame(channelSlot, () => { ran++; });
        off();

        frame();
        expect(ran).toBe(0);
    });

    it('is called in registration order among the standing handlers', () => {
        const { channelService, channelSlot, frame } = fixture();
        const order: string[] = [];
        channelService.subscribeAfterEachFrame(channelSlot, () => { order.push('standing-first'); });
        channelService.subscribeOnceAfterFrame(channelSlot, () => { order.push('one-shot'); });
        channelService.subscribeAfterEachFrame(channelSlot, () => { order.push('standing-last'); });

        frame();
        expect(order).toEqual(['standing-first', 'one-shot', 'standing-last']);
        order.length = 0;

        // And the set it left is the set the other two are still in.
        frame();
        expect(order).toEqual(['standing-first', 'standing-last']);
    });
});

describe('asked for from inside an effect, which is what it is for', () => {
    it('runs in the tail of that same frame, after every effect of it', () => {
        const { db, channelService, channelSlot, effectService, slot, frame } = fixture();
        const order: string[] = [];
        effectService.createEffect(db, [slot], [], () => {
            order.push('effect-that-asks');
            channelService.subscribeOnceAfterFrame(channelSlot, () => { order.push('after-the-layout'); });
        });
        effectService.createEffect(db, [slot], [], () => { order.push('other-effect'); });

        frame();

        // Not "the next frame": the phase had not begun when the drain
        // registered it, so this frame owes it — with the frame's other effect
        // already run.
        expect(order).toEqual(['effect-that-asks', 'other-effect', 'after-the-layout']);
    });

    it('is called once per frame, where the standing handler accumulates', () => {
        const oneShot = fixture();
        let oneShotRan = 0;
        channelAsking(oneShot, () => {
            oneShot.channelService.subscribeOnceAfterFrame(oneShot.channelSlot, () => { oneShotRan++; });
        });

        const standing = fixture();
        let standingRan = 0;
        channelAsking(standing, () => {
            standing.channelService.subscribeAfterEachFrame(standing.channelSlot, () => { standingRan++; });
        });

        oneShot.frame(); standing.frame();
        expect(oneShotRan).toBe(1);
        expect(standingRan).toBe(1);

        oneShot.frame(); standing.frame();
        expect(oneShotRan).toBe(2);
        // TWO handlers by now — the first frame's registration is still standing
        // and the second frame's has joined it. This is the defect the one-shot
        // does not have, not a claim about what a caller ought to want.
        expect(standingRan).toBe(3);

        oneShot.frame(); standing.frame();
        expect(oneShotRan).toBe(3);
        expect(standingRan).toBe(6);
    });
});

/** An effect that does nothing but ask, so the two arms differ in one line. */
const channelAsking = (
    fixture: { db: OIMDB; effectService: OIMEffectService; slot: TRowSlot }, ask: () => void,
): void => {
    fixture.effectService.createEffect(fixture.db, [fixture.slot], [], ask);
};

describe('what it does with a throw and with the phase it was made in', () => {
    it('comes off before the body runs, so a throw is reported once and not replayed', () => {
        const reported: unknown[] = [];
        const { channelService, channelSlot, frame } = fixture((error) => { reported.push(error); });
        let ran = 0;
        channelService.subscribeOnceAfterFrame(channelSlot, () => {
            ran++;
            throw new Error('the one-shot threw');
        });

        frame();
        expect(ran).toBe(1);
        expect(reported).toHaveLength(1);

        // Removed before it was called, so the throw left nothing standing.
        frame();
        expect(ran).toBe(1);
        expect(reported).toHaveLength(1);
    });

    it('sits out the frame when it is asked for from the phase itself', () => {
        const { channelService, channelSlot, frame } = fixture();
        let ran = 0;
        let asked = false;
        const off: TOIMDisposer = channelService.subscribeAfterEachFrame(channelSlot, () => {
            if (asked) return;
            asked = true;
            channelService.subscribeOnceAfterFrame(channelSlot, () => { ran++; });
        });

        // The phase settled who it owed before it called the handler that asked,
        // so the frame it was made in is not its frame.
        frame();
        expect(ran).toBe(0);
        frame();
        expect(ran).toBe(1);

        off();
    });
});
