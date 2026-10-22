import { OIMDB } from '../../../factories/OIMDB';
import { createOIMComputedService } from '../../../factories/createOIMComputedService';
import { OIMChannelService } from '../../channel/OIMChannelService';
import { OIMSlotOwner } from '../../slot/OIMSlotOwner';
import { OIMEffectService } from '../OIMEffectService';
import { oimIsEffectRunScheduled } from '../utils/oimIsEffectRunScheduled';
import { createOIMEntitySlot } from '../../entity/utils/createOIMEntitySlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMSlotEditable } from '../../slot/types/TOIMSlotEditable';
import { OIMSlotStoreServiceSingleSlotDriven } from '../../store/OIMSlotStoreServiceSingleSlotDriven';
import type { TOIMComputedSlot } from '../types/TOIMComputedSlot';

type TRow = { isOn: boolean; text: string };

const makeSlot = (key: string, row: TRow): TOIMEntitySlot<TRow, string> => {
    const slot = createOIMEntitySlot<TRow, string>(key, new OIMSlotOwner());
    (slot as TOIMSlotEditable<typeof slot>).entity = row;
    return slot;
};

describe('an effect is never queued by its own subscription', () => {
    it('is not queued when created inside a running frame, and its body waits for a later write', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const outer = makeSlot('outer', { isOn: false, text: 'a' });
        const inner = makeSlot('inner', { isOn: false, text: 'b' });
        let born: ReturnType<OIMEffectService['createEffect']> | undefined;
        let bornRuns = 0;
        effectService.createEffect(db, [outer], [], () => {
            born ??= effectService.createEffect(db, [inner], [], () => { bornRuns++; });
        });

        OIMChannelService.INSTANCE.write(db.defaultChannelSlot, outer);
        db.flush();
        expect(born).toBeDefined();
        expect(born !== undefined && oimIsEffectRunScheduled(born)).toBe(false);
        expect(bornRuns).toBe(0);

        OIMChannelService.INSTANCE.write(db.defaultChannelSlot, inner);
        db.flush();
        expect(bornRuns).toBe(1);
    });

    it('runs a tracked effect once when its run first reads a source already written in that frame', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const toggle = makeSlot('toggle', { isOn: false, text: '' });
        const label = makeSlot('label', { isOn: false, text: 'before' });
        const seen: string[] = [];
        const effect = effectService.createEffectWithSourceTracking(db, effectSourceTracker => {
            const isOn = effectSourceTracker.readSourceSlot(toggle).entity?.isOn ?? false;
            seen.push(isOn ? effectSourceTracker.readSourceSlot(label).entity?.text ?? '' : 'off');
        });

        (toggle as TOIMSlotEditable<typeof toggle>).entity = { isOn: true, text: '' };
        OIMChannelService.INSTANCE.write(db.defaultChannelSlot, toggle);
        (label as TOIMSlotEditable<typeof label>).entity = { isOn: false, text: 'after' };
        OIMChannelService.INSTANCE.write(db.defaultChannelSlot, label);
        db.flush();

        expect(seen).toEqual(['off', 'after']);
        expect(oimIsEffectRunScheduled(effect)).toBe(false);
        db.flush();
        expect(seen).toEqual(['off', 'after']);
    });
});

describe('who asks an effect\'s sources before it runs', () => {
    it('runs an effect queued by a write without asking its sources, when it reads no computed', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const source = makeSlot('source', { isOn: false, text: 'a' });
        let runs = 0;
        effectService.createEffect(db, [source], [], () => { runs++; });
        const runEffectIfSourcesChanged = jest.spyOn(effectService, 'runEffectIfSourcesChanged');

        OIMChannelService.INSTANCE.write(db.defaultChannelSlot, source);
        db.flush();

        expect(runs).toBe(1);
        expect(runEffectIfSourcesChanged).not.toHaveBeenCalled();
    });

    it('asks the sources of an effect created after a write in the open batch, and runs it when the same slot is written again', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const source = makeSlot('source', { isOn: false, text: 'a' });
        source.owner.holdSlot(source);
        OIMChannelService.INSTANCE.write(db.defaultChannelSlot, source);
        let runs = 0;
        const effect = effectService.createEffect(db, [source], [], () => { runs++; });
        const runEffectIfSourcesChanged = jest.spyOn(effectService, 'runEffectIfSourcesChanged');

        OIMChannelService.INSTANCE.write(db.defaultChannelSlot, source);
        db.flush();

        expect(runs).toBe(1);
        expect(runEffectIfSourcesChanged).toHaveBeenCalledWith(effect);
    });

    it('does not run an effect whose computed source re-derives to the same value', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const source = makeSlot('source', { isOn: false, text: 'abc' });
        const textLengthService = createOIMComputedService<void, number>({
            computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>(),
        });
        const textLength = textLengthService.createComputedStoreSlot(
            db,
            () => source.entity?.text.length ?? 0,
            () => ({ sourceSlots: [source] }),
        );
        const textLengthSlot = textLengthService.computedCollectionService.getSlotByKey(textLength, undefined);
        let runs = 0;
        effectService.createEffect(db, [], [textLengthSlot], () => { runs++; });
        expect(textLengthSlot.computedValueService.getValueForSlot(textLengthSlot)).toBe(3);
        db.flush();

        (source as TOIMSlotEditable<typeof source>).entity = { isOn: false, text: 'xyz' };
        OIMChannelService.INSTANCE.write(db.defaultChannelSlot, source);
        db.flush();
        expect(runs).toBe(0);

        (source as TOIMSlotEditable<typeof source>).entity = { isOn: false, text: 'longer' };
        OIMChannelService.INSTANCE.write(db.defaultChannelSlot, source);
        db.flush();
        expect(runs).toBe(1);
    });
});
