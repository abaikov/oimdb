import {
    OIMReactiveCollection,
    OIMEventQueue,
    OIMEventQueueSchedulerImmediate,
    OIMCollectionStoreTrieDriven,
    TOIMKeyPath,
} from '@oimdb/core';
import { OIMSnapshotManager } from '../src/core/OIMSnapshotManager';

interface Membership {
    userId: number;
    projectId: number;
    role: string;
}

describe('snapshot-manager with a composite-PK collection', () => {
    it('round-trips composite PKs (stored as values, no string key)', () => {
        const queue = new OIMEventQueue({
            scheduler: new OIMEventQueueSchedulerImmediate(),
        });
        const memberships = new OIMReactiveCollection<Membership, TOIMKeyPath>(
            queue,
            {
                selectPk: m => [m.userId, m.projectId],
                store: new OIMCollectionStoreTrieDriven<Membership>(),
            }
        );
        const mgr = new OIMSnapshotManager({ memberships });

        memberships.upsertMany([
            { userId: 1, projectId: 10, role: 'admin' },
            { userId: 2, projectId: 10, role: 'member' },
        ]);

        const snap = mgr.takeSnapshot() as {
            memberships?: Array<{ pk: TOIMKeyPath; entity: Membership }>;
        };
        const pks = (snap.memberships ?? []).map(e => e.pk).sort();
        expect(pks).toEqual([
            [1, 10],
            [2, 10],
        ]);
        const admin = (snap.memberships ?? []).find(
            e => e.entity.role === 'admin'
        );
        expect(admin?.pk).toEqual([1, 10]);

        mgr.destroy();
        memberships.destroy();
        queue.destroy();
    });
});
