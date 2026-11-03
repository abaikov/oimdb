import { OIMDB, OIMDefaults, createOIMSlotCollectionService, createOIMEntityContentService } from '@oimdb/core';
import { OIM_DEV_DEFAULTS, OIM_DEV_REGISTRY } from '../src';

type TUser = { id: string; name: string };

describe('what the dev defaults hand a service', () => {
    it('hand the dev registry every store slot a service built with them creates', () => {
        const heard = jest.spyOn(OIM_DEV_REGISTRY, 'onStoreSlotCreated');
        const usersService = createOIMSlotCollectionService({
            defaults: OIM_DEV_DEFAULTS,
            slotContentService: createOIMEntityContentService<TUser>({ defaults: OIM_DEV_DEFAULTS }),
        });

        const users = usersService.createStoreSlot(new OIMDB());

        expect(heard).toHaveBeenCalledWith(users);
        heard.mockRestore();
    });

    it('leave a service built without them unheard', () => {
        const heard = jest.spyOn(OIM_DEV_REGISTRY, 'onStoreSlotCreated');
        const usersService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TUser>() });

        usersService.createStoreSlot(new OIMDB());

        expect(heard).not.toHaveBeenCalled();
        expect(OIMDefaults.INSTANCE.storeSlotListener).toBeUndefined();
        heard.mockRestore();
    });

    it('report a store slot registered with the registry', () => {
        const db = new OIMDB();
        const usersService = createOIMSlotCollectionService({ defaults: OIM_DEV_DEFAULTS, slotContentService: createOIMEntityContentService<TUser>() });
        const users = usersService.createStoreSlot(db);
        usersService.writeSlotContentByKey(users, 'u1', { id: 'u1', name: 'Ada' });

        OIM_DEV_REGISTRY.collection('defaults-users', usersService, users);

        expect(OIM_DEV_REGISTRY.inspect().collections['defaults-users']?.count).toBe(1);
    });
});
