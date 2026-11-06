import { exoContextFrame, readExoContext } from '@exodra/context';
import type { TExoContextFrame, TExoContextToken } from '@exodra/context';
import { OIMDB, createOIMEntitySlotCollectionStoreAggregate } from '@oimdb/core';
import { OIMExodraPlugin } from '../src/OIMExodraPlugin';
import { OIM_EXODRA_PLUGIN_CONTEXT_TOKEN } from '../src/OIM_EXODRA_PLUGIN_CONTEXT_TOKEN';
import { resolveOIMExodraPlugin } from '../src/resolveOIMExodraPlugin';

const nodeWith = (context: TExoContextFrame | null, exodraPlugin?: OIMExodraPlugin) => ({
    exodraPlugin,
    inject: <TValue>(key: TExoContextToken<TValue>): TValue | undefined => readExoContext(context, key),
});

describe('what resolves the exodra plugin', () => {
    it('takes the plugin provided above the node over the backend one, and the backend one otherwise', () => {
        const backendPlugin = new OIMExodraPlugin({ db: new OIMDB() });
        const providedPlugin = new OIMExodraPlugin({ db: new OIMDB() });

        expect(resolveOIMExodraPlugin(nodeWith(null, backendPlugin))).toBe(backendPlugin);
        expect(resolveOIMExodraPlugin(nodeWith(exoContextFrame(null, OIM_EXODRA_PLUGIN_CONTEXT_TOKEN, providedPlugin), backendPlugin)))
            .toBe(providedPlugin);
    });

    it('claims its own slot data cell on each database', () => {
        const db = new OIMDB();
        db.claimSlotDataCell();

        expect(new OIMExodraPlugin({ db }).slotDataCell).toBe(1);
        expect(new OIMExodraPlugin({ db: new OIMDB() }).slotDataCell).toBe(0);
    });

    it('refuses a node with neither', () => {
        expect(() => resolveOIMExodraPlugin(nodeWith(null))).toThrow(/No OIMExodraPlugin/);
    });
});

describe('what disposing the exodra plugin stops', () => {
    it('leaves a parked node alone once disposed, where before it destroyed it on release', () => {
        const releasedWith = (dispose: boolean): number => {
            const db = new OIMDB();
            const todos = createOIMEntitySlotCollectionStoreAggregate<{ id: string }>(db);
            todos.writeSlotContentByKey('1', { id: '1' });
            db.flush();
            const exodraPlugin = new OIMExodraPlugin({ db });
            const todoSlot = todos.getSlotByKey('1');
            let destroys = 0;
            todoSlot.data = [];
            todoSlot.data[exodraPlugin.slotDataCell] = { parkedSlots: new Set([todoSlot]), node: { destroyExoSelf: () => { destroys++; } } };
            if (dispose) exodraPlugin.dispose();
            todoSlot.clearSlotContent();
            db.flush();
            return destroys;
        };

        expect(releasedWith(false)).toBe(1);
        expect(releasedWith(true)).toBe(0);
    });
});
