import { OIMDB } from '../../db/OIMDB';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionStoreAggregate } from '../../slot/createOIMSlotCollectionStoreAggregate';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';

type TTodo = { id: string; title: string };

describe('what a slot release listener hears', () => {
    it('hears a slot the engine lets go, with its data still on it, and a column slot too', () => {
        const released: TOIMSlot[] = [];
        const db = new OIMDB();
        const disposeListener = db.addSlotReleaseListener({ onSlotReleased: slot => { released.push(slot); } });
        const todos = createOIMSlotCollectionStoreAggregate(db, { slotContentService: createOIMEntityContentService<TTodo>() });
        todos.writeSlotContentByKey('t1', { id: 't1', title: 'Write' });
        db.flush();
        const todo = todos.holdSlotByKey('t1');
        todo.data = ['cached node'];
        const titleColumn = todo.holdColumnSlot('title');

        titleColumn.unholdSlot();
        todo.clearSlotContent();
        todo.unholdSlot();
        db.flush();

        expect(released).toContain(titleColumn);
        expect(released).toContain(todo);
        expect(released.find(slot => slot === todo)?.data).toEqual(['cached node']);
        disposeListener();
    });

    it('stops hearing once its disposer runs, and two listeners each hear a release', () => {
        const db = new OIMDB();
        const first: TOIMSlot[] = [];
        const second: TOIMSlot[] = [];
        const disposeFirst = db.addSlotReleaseListener({ onSlotReleased: slot => { first.push(slot); } });
        db.addSlotReleaseListener({ onSlotReleased: slot => { second.push(slot); } });
        const todos = createOIMSlotCollectionStoreAggregate(db, { slotContentService: createOIMEntityContentService<TTodo>() });
        disposeFirst();
        todos.getSlotByKey('t1');
        db.flush();

        expect(first).toEqual([]);
        expect(second.length).toBe(1);
    });

    it('hands out a fresh slot data cell per claim', () => {
        const db = new OIMDB();

        expect([db.claimSlotDataCell(), db.claimSlotDataCell(), new OIMDB().claimSlotDataCell()]).toEqual([0, 1, 0]);
    });
});
