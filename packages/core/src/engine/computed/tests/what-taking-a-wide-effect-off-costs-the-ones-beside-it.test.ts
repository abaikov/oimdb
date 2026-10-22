import { OIMDB } from '../../../factories/OIMDB';
import { OIMEffectService } from '../OIMEffectService';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import type { TOIMEffect } from '../types/TOIMEffect';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';

type TRow = { id: string; n: number };

const countRootReads = (effect: TOIMEffect): (() => number) => {
    let reads = 0;
    const roots = effect.allRootSlots;
    Object.defineProperty(effect, 'allRootSlots', {
        value: new Proxy(roots as TOIMSlot[], {
            get(target, property) {
                if (typeof property === 'string' && /^\d+$/.test(property)) reads++;
                return Reflect.get(target, property);
            },
        }),
    });
    return () => reads;
};

const wideWorld = (size: number) => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const rowsService = createOIMEntityService<TRow>(db, { keyOf: row => row.id });
    const rows = rowsService.createStoreSlot(db);
    const slots = Array.from({ length: size }, (_, i) => rowsService.slotContentService.upsertEntity(rows, { id: `r${i}`, n: i }));
    db.flush();
    return { db, effectService, rowsService, rows, slots };
};

describe('what taking a wide effect off costs the effects beside it', () => {
    it.each([100, 1000])('reads none of the other effect\'s %i roots', size => {
        const { db, effectService, slots } = wideWorld(size);
        const leaving = effectService.createEffect(db, slots, [], () => undefined);
        const staying = effectService.createEffect(db, slots, [], () => undefined);
        const rootReads = countRootReads(staying);

        effectService.disposeEffect(leaving);

        expect(rootReads()).toBe(0);
    });

    it('still wakes the effect that stayed, from every slot, after its places moved', () => {
        const { db, effectService, rowsService, slots } = wideWorld(5);
        const first = effectService.createEffect(db, slots, [], () => undefined);
        let runs = 0;
        const staying = effectService.createEffect(db, slots, [], () => { runs++; });
        const third = effectService.createEffect(db, [slots[2]], [], () => undefined);
        db.flush();
        const born = runs;

        effectService.disposeEffect(first);
        for (let i = 0; i < slots.length; i++) {
            rowsService.slotContentService.updateEntity(slots[i], { n: 100 + i });
            db.flush();
        }

        expect(runs - born).toBe(5);
        expect(slots.every(slot => slot.effects?.includes(staying) === true)).toBe(true);
        effectService.disposeEffect(third);
        effectService.disposeEffect(staying);
        expect(slots.every(slot => (slot.effects?.length ?? 0) === 0)).toBe(true);
    });

    it('takes the effect off cleanly when the slots list it in different orders', () => {
        const { db, effectService, slots } = wideWorld(4);
        const a = effectService.createEffect(db, [slots[0], slots[1], slots[2], slots[3]], [], () => undefined);
        const b = effectService.createEffect(db, [slots[3], slots[2], slots[1], slots[0]], [], () => undefined);
        const c = effectService.createEffect(db, [slots[1], slots[3]], [], () => undefined);

        effectService.disposeEffect(a);
        effectService.disposeEffect(c);

        expect(slots.map(slot => slot.effects?.length)).toEqual([1, 1, 1, 1]);
        effectService.disposeEffect(b);
        expect(slots.map(slot => slot.effects?.length)).toEqual([0, 0, 0, 0]);
    });
});
