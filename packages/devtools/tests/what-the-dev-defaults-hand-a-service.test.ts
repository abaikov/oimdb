import { OIMDB, OIMDefaults, createOIMSlotCollectionService, createOIMSlotContentEntityService } from '@oimdb/core';
import { oimDevDefaults, oimDevRegistry } from '../src';

type TUser = { id: string; name: string };

describe('what the dev defaults hand a service', () => {
    it('hand the dev registry every store slot a service built with them creates', () => {
        const heard = jest.spyOn(oimDevRegistry, 'onStoreSlotCreated');
        const usersService = createOIMSlotCollectionService({
            defaults: oimDevDefaults,
            slotContentService: createOIMSlotContentEntityService<TUser>({ defaults: oimDevDefaults }),
        });

        const users = usersService.createStoreSlot(new OIMDB());

        expect(heard).toHaveBeenCalledWith(users);
        heard.mockRestore();
    });

    it('leave a service built without them unheard', () => {
        const heard = jest.spyOn(oimDevRegistry, 'onStoreSlotCreated');
        const usersService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TUser>() });

        usersService.createStoreSlot(new OIMDB());

        expect(heard).not.toHaveBeenCalled();
        expect(OIMDefaults.INSTANCE.storeSlotListener).toBeUndefined();
        heard.mockRestore();
    });

    it('report a store slot registered with the registry', () => {
        const db = new OIMDB();
        const usersService = createOIMSlotCollectionService({ defaults: oimDevDefaults, slotContentService: createOIMSlotContentEntityService<TUser>() });
        const users = usersService.createStoreSlot(db);
        usersService.writeSlotContentByKey(users, 'u1', { id: 'u1', name: 'Ada' });

        oimDevRegistry.collection('defaults-users', usersService, users);

        expect(oimDevRegistry.inspect().collections['defaults-users']?.count).toBe(1);
    });
});
