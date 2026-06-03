import {
    OIMEventQueue,
    OIMEventQueueSchedulerImmediate,
    OIMReactiveCollection,
    OIMReactiveIndexManualSetBased,
} from '@oimdb/core';

interface IUser {
    id: string;
    name: string;
    role: 'admin' | 'member';
}

async function basicUsageExample(): Promise<void> {
    const queue = new OIMEventQueue({ scheduler: new OIMEventQueueSchedulerImmediate() });
    const users = new OIMReactiveCollection<IUser, string>(queue, { selectPk: (u) => u.id });
    const byRole = new OIMReactiveIndexManualSetBased<'admin' | 'member', string>(queue);

    const unsubscribe = byRole.subscribeOnKey('admin', () => {
        console.log('admin set:', byRole.getPksByKey('admin'));
    });

    users.upsertMany([
        { id: 'u1', name: 'Alice', role: 'admin' },
        { id: 'u2', name: 'Bob',   role: 'member' },
    ]);
    byRole.setSlots('admin',  [users.getSlotByPk('u1')!]);
    byRole.setSlots('member', [users.getSlotByPk('u2')!]);
    queue.flush(); // logs: admin set: Set { 'u1' }

    // Promote Bob to admin
    byRole.setSlots('admin',  [users.getSlotByPk('u1')!, users.getSlotByPk('u2')!]);
    byRole.setSlots('member', []);
    queue.flush(); // logs: admin set: Set { 'u1', 'u2' }

    unsubscribe();
    byRole.destroy();
    users.destroy();
    queue.destroy();
    console.log('Done.');
}

if (require.main === module) {
    basicUsageExample().catch(console.error);
}

export { basicUsageExample };
