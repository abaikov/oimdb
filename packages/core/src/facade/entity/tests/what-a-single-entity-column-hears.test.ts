import { OIMDB } from '../../../factories/OIMDB';
import { OIMEffectService } from '../../../engine/computed/OIMEffectService';
import { createOIMSingleEntityService } from '../../../factories/createOIMSingleEntityService';
import { oimIsSlotReleased } from '../../../engine/slot/utils/oimIsSlotReleased';

type TSession = { userId: string; theme: string; locale: string };

const createFixture = (columns?: readonly ('theme' | 'locale')[]) => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const sessionService = createOIMSingleEntityService<TSession, 'theme' | 'locale'>(db, columns !== undefined ? { columnNames: columns } : {});
    const session = sessionService.createStoreSlot(db);
    sessionService.slotContentService.upsertEntity(session, { userId: 'u1', theme: 'dark', locale: 'en' });
    db.flush();
    return { db, effectService, sessionService, session };
};

describe('what a single entity column hears', () => {
    it.each([['without columns', undefined], ['with columns', ['theme', 'locale'] as const]])(
        'wakes a column and a group of its columns, and not for another column, %s',
        (_label, columns) => {
            const { db, effectService, sessionService, session } = createFixture(columns);
            let themeRuns = 0;
            let groupRuns = 0;
            effectService.createEffect(db, [sessionService.holdColumn(sessionService.getSingleSlot(session), 'theme')], [], () => { themeRuns++; });
            effectService.createEffect(db, [sessionService.holdColumnGroup(sessionService.getSingleSlot(session), sessionService.getColumnGroup(['theme', 'locale']))], [], () => {
                groupRuns++;
            });
            db.flush();
            sessionService.slotContentService.updateEntity(sessionService.getSingleSlot(session), { userId: 'u2' });
            db.flush();
            sessionService.slotContentService.updateEntity(sessionService.getSingleSlot(session), { locale: 'de' });
            db.flush();
            sessionService.slotContentService.updateEntity(sessionService.getSingleSlot(session), { theme: 'light' });
            db.flush();
            expect({ themeRuns, groupRuns }).toEqual({ themeRuns: 1, groupRuns: 2 });
        },
    );

    it('refuses a slot for a column it was not given', () => {
        const { sessionService, session } = createFixture(['theme']);
        expect(() => sessionService.holdColumn(sessionService.getSingleSlot(session), 'locale')).toThrow('"locale" is not among the columns');
    });

    it('gives a column slot back and drops the store it filed it in', () => {
        const { db, sessionService, session } = createFixture();
        const sessionSlot = sessionService.getSingleSlot(session);
        const themeSlot = sessionService.getColumn(sessionSlot, 'theme');
        expect(sessionSlot.columnSlotStore === undefined).toBe(false);
        db.flush();
        expect(sessionService.getSingleSlot(session)).toBe(sessionSlot);
        expect(oimIsSlotReleased(themeSlot) && sessionSlot.columnSlotStore === undefined).toBe(true);
    });
});
