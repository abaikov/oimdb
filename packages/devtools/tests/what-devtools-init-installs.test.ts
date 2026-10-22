import { OIMDB, OIMDefaults, createOIMEntityService } from '@oimdb/core';
import { oimDevRegistry, oimInitDevtools } from '../src';

type TUser = { id: string; name: string };

describe('what oimInitDevtools installs', () => {
    it('installs the dev registry as the default store slot listener when it is called', () => {
        expect(() => { oimInitDevtools(); }).not.toThrow();
        expect(OIMDefaults.STORE_SLOT_LISTENER.getValue()).toBe(oimDevRegistry);
    });

    it('reports a store slot registered with it', () => {
        const db = new OIMDB();
        const usersService = createOIMEntityService<TUser>(db, { keyOf: user => user.id });
        const users = usersService.createStoreSlot(db);
        usersService.slotContentService.upsertEntity(users, { id: 'u1', name: 'Ada' });

        oimDevRegistry.collection('init-users', usersService, users);

        expect(oimDevRegistry.inspect().collections['init-users']?.count).toBe(1);
    });

    it('cannot be called again once a store slot was built, because the default is already handed out', () => {
        expect(() => { oimInitDevtools(); }).toThrow();
    });
});
