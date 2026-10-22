import { OIMEventQueue } from '../src/core/OIMEventQueue';
import { OIMReactiveCollection } from '../src/core/OIMReactiveCollection';
import { OIMCarrierKeyedFieldEmitter } from '../src/core/OIMCarrierKeyedFieldEmitter';
import { OIMSlotWriterFieldMasked } from '../src/core/OIMSlotWriterFieldMasked';
import { OIMFieldMaskRegistry } from '../src/core/OIMFieldMaskRegistry';
import { createMergeEntityUpdater } from '../src/core/createMergeEntityUpdater';
import type { TOIMEntitySlot } from '../src/types/TOIMEntitySlot';

type TUser = { id: string; teamId: string; name: string; active: boolean };

/**
 * Field-scoped subscription end to end.
 *
 * The emitter records nothing — the slot writer owns the only field registry and
 * writes the masks; the emitter reads them to decide who to wake. So these tests
 * drive a real collection wired with both halves rather than a synthetic carrier:
 * a mask that a writer never produced would prove nothing about delivery.
 */
const setup = () => {
    const queue = new OIMEventQueue();
    const fields = new OIMFieldMaskRegistry();
    const collection = new OIMReactiveCollection<
        TUser,
        string,
        OIMCarrierKeyedFieldEmitter<string, TOIMEntitySlot<TUser, string>>
    >(queue, {
        selectPk: u => u.id,
        slotWriter: new OIMSlotWriterFieldMasked<TUser, string>(
            queue,
            createMergeEntityUpdater<TUser>(),
            fields
        ),
        createUpdateEmitter: (q, carrierProvider) =>
            new OIMCarrierKeyedFieldEmitter(q, carrierProvider),
    });
    collection.upsertMany([
        { id: 'u1', teamId: 't0', name: 'a', active: true },
        { id: 'u2', teamId: 't0', name: 'b', active: true },
    ]);
    queue.flush();
    return { queue, collection, fields, emitter: collection.emitter };
};

describe('OIMCarrierKeyedFieldEmitter', () => {
    it('wakes a field-scoped subscriber only for its own fields', () => {
        const { queue, collection, fields, emitter } = setup();
        let wakeups = 0;
        emitter.subscribeOnKeyFields('u1', fields.maskOf(['name']), () => {
            wakeups++;
        });

        collection.upsertOneByPk('u1', { active: false });
        queue.flush();
        expect(wakeups).toBe(0);

        collection.upsertOneByPk('u1', { name: 'z' });
        queue.flush();
        expect(wakeups).toBe(1);
    });

    it('wakes a subscriber that declared several fields for any of them', () => {
        const { queue, collection, fields, emitter } = setup();
        let wakeups = 0;
        emitter.subscribeOnKeyFields(
            'u1',
            fields.maskOf(['name', 'teamId']),
            () => {
                wakeups++;
            }
        );

        collection.upsertOneByPk('u1', { teamId: 't9' });
        queue.flush();
        collection.upsertOneByPk('u1', { name: 'z' });
        queue.flush();
        collection.upsertOneByPk('u1', { active: false });
        queue.flush();

        expect(wakeups).toBe(2);
    });

    it('treats a plain subscribeOnKey as watching every field', () => {
        const { queue, collection, emitter } = setup();
        let wakeups = 0;
        emitter.subscribeOnKey('u1', () => {
            wakeups++;
        });

        collection.upsertOneByPk('u1', { active: false });
        queue.flush();
        expect(wakeups).toBe(1);
    });

    it('accumulates fields written across one frame', () => {
        const { queue, collection, fields, emitter } = setup();
        let wakeups = 0;
        emitter.subscribeOnKeyFields('u1', fields.maskOf(['teamId']), () => {
            wakeups++;
        });

        // Two writes before a single flush: the second must not lose the first's
        // fields, and the field this subscriber wants arrives in the first.
        collection.upsertOneByPk('u1', { teamId: 't9' });
        collection.upsertOneByPk('u1', { name: 'z' });
        queue.flush();
        expect(wakeups).toBe(1);
    });

    it('does not carry a mask from one frame into the next', () => {
        const { queue, collection, fields, emitter } = setup();
        let wakeups = 0;
        emitter.subscribeOnKeyFields('u1', fields.maskOf(['teamId']), () => {
            wakeups++;
        });

        collection.upsertOneByPk('u1', { teamId: 't9' });
        queue.flush();
        expect(wakeups).toBe(1);

        // A later frame touching only `name` must not see `teamId` still set.
        collection.upsertOneByPk('u1', { name: 'z' });
        queue.flush();
        expect(wakeups).toBe(1);
    });

    it('sleeps through a field that changed and changed back in one frame', () => {
        const { queue, collection, fields, emitter } = setup();
        let wakeups = 0;
        emitter.subscribeOnKeyFields('u1', fields.maskOf(['name']), () => {
            wakeups++;
        });

        collection.upsertOneByPk('u1', { name: 'z' });
        collection.upsertOneByPk('u1', { name: 'a' });
        queue.flush();
        expect(wakeups).toBe(0);
        expect(collection.getOneByPk('u1')?.name).toBe('a');
    });

    it('wakes every field subscriber on an insert', () => {
        const { queue, collection, fields, emitter } = setup();
        let wakeups = 0;
        emitter.subscribeOnKeyFields('u3', fields.maskOf(['name']), () => {
            wakeups++;
        });

        // A new entity changes every field from "absent" to a value, so a
        // subscriber watching any one of them must see it appear.
        collection.upsertOne({ id: 'u3', teamId: 't1', name: 'c', active: true });
        queue.flush();
        expect(wakeups).toBe(1);
    });

    it('stops delivering after the field subscription is disposed', () => {
        const { queue, collection, fields, emitter } = setup();
        let wakeups = 0;
        const stop = emitter.subscribeOnKeyFields(
            'u1',
            fields.maskOf(['name']),
            () => {
                wakeups++;
            }
        );
        stop();

        collection.upsertOneByPk('u1', { name: 'z' });
        queue.flush();
        expect(wakeups).toBe(0);
    });

    it('keeps unrelated keys asleep', () => {
        const { queue, collection, fields, emitter } = setup();
        let wakeups = 0;
        emitter.subscribeOnKeyFields('u1', fields.maskOf(['name']), () => {
            wakeups++;
        });

        collection.upsertOneByPk('u2', { name: 'z' });
        queue.flush();
        expect(wakeups).toBe(0);
    });

    it('mixes scoped and unscoped subscribers on one key', () => {
        const { queue, collection, fields, emitter } = setup();
        let scoped = 0;
        let unscoped = 0;
        emitter.subscribeOnKeyFields('u1', fields.maskOf(['name']), () => {
            scoped++;
        });
        emitter.subscribeOnKey('u1', () => {
            unscoped++;
        });

        collection.upsertOneByPk('u1', { active: false });
        queue.flush();
        expect(scoped).toBe(0);
        expect(unscoped).toBe(1);
    });

    it('wakes everything once the registry saturates', () => {
        const { queue, collection, fields, emitter } = setup();
        // Exhaust the 32 available bits, then take a mask for one more field.
        for (let i = 0; i < 32; i++) fields.bitOf(`f${i}`);
        expect(fields.isSaturated).toBe(true);

        let wakeups = 0;
        emitter.subscribeOnKeyFields('u1', fields.maskOf(['overflow']), () => {
            wakeups++;
        });
        // A field past capacity maps to ALL_FIELDS, so it matches rather than
        // silently missing — conservative, never wrong.
        collection.upsertOneByPk('u1', { name: 'z' });
        queue.flush();
        expect(wakeups).toBe(1);
    });

    it('wakes on every write when no writer records fields', () => {
        // The emitter installed without the field writer: nothing produces masks,
        // so a field-scoped subscriber degrades to waking on everything rather
        // than pretending to filter.
        const queue = new OIMEventQueue();
        const fields = new OIMFieldMaskRegistry();
        const collection = new OIMReactiveCollection<
            TUser,
            string,
            OIMCarrierKeyedFieldEmitter<string, TOIMEntitySlot<TUser, string>>
        >(queue, {
            selectPk: u => u.id,
            createUpdateEmitter: (q, carrierProvider) =>
                new OIMCarrierKeyedFieldEmitter(q, carrierProvider),
        });
        collection.upsertOne({ id: 'u1', teamId: 't0', name: 'a', active: true });
        queue.flush();

        let wakeups = 0;
        collection.emitter.subscribeOnKeyFields(
            'u1',
            fields.maskOf(['name']),
            () => {
                wakeups++;
            }
        );
        collection.upsertOneByPk('u1', { active: false });
        queue.flush();
        expect(wakeups).toBe(1);
        expect(collection.fields).toBeUndefined();
    });
});
