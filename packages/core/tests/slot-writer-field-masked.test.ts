import { OIMSlotWriter } from '../src/core/OIMSlotWriter';
import { OIMSlotWriterFieldMasked } from '../src/core/OIMSlotWriterFieldMasked';
import { NO_FIELDS } from '../src/core/OIMFieldMaskRegistry';
import { createMergeEntityUpdater } from '../src/core/createMergeEntityUpdater';
import { createInPlaceEntityUpdater } from '../src/core/createInPlaceEntityUpdater';
import { OIMEventQueue } from '../src/core/OIMEventQueue';
import type { TOIMEntitySlot } from '../src/types/TOIMEntitySlot';

type TUser = { id: string; teamId: string; name: string; active: boolean };

const makeSlot = (): TOIMEntitySlot<TUser, string> => ({
    pk: 'u1',
    item: { id: 'u1', teamId: 't0', name: 'a', active: true },
});

const makeWriter = () =>
    new OIMSlotWriterFieldMasked<TUser, string>(
        new OIMEventQueue(),
        createMergeEntityUpdater<TUser>()
    );

/**
 * Everything a delivery would see: which fields the frame ended up reporting.
 * The writer settles the mask as it writes, so this is a plain read.
 */
const deliver = (
    _writer: OIMSlotWriterFieldMasked<TUser, string>,
    slot: TOIMEntitySlot<TUser, string>
) => (slot.dirty ? (slot.dirtyFields ?? NO_FIELDS) : NO_FIELDS);

/** Stand in for the emitter marking the slot as queued for this flush. */
const markDirty = (slot: TOIMEntitySlot<TUser, string>) => {
    slot.dirty = true;
};

describe('OIMSlotWriterFieldMasked', () => {
    it('does not publish a write that sets the same value', () => {
        const writer = makeWriter();
        const slot = makeSlot();

        expect(writer.write(slot, { name: 'a' })).toBe(false);
        expect(slot.dirty).toBeUndefined();
        expect(slot.item?.name).toBe('a');
    });

    it('publishes a real change and reports only that field', () => {
        const writer = makeWriter();
        const slot = makeSlot();

        expect(writer.write(slot, { name: 'b' })).toBe(true);
        markDirty(slot);
        const nameBit = writer.fields.bitOf('name');
        const activeBit = writer.fields.bitOf('active');

        expect(deliver(writer, slot) & nameBit).toBe(nameBit);
        expect(deliver(writer, slot) & activeBit).toBe(0);
        expect(slot.item?.name).toBe('b');
    });

    it('suppresses a field that changed and changed back in one flush', () => {
        const writer = makeWriter();
        const slot = makeSlot();
        const nameBit = writer.fields.bitOf('name');

        writer.write(slot, { name: 'b' });
        markDirty(slot);
        writer.write(slot, { name: 'a' });

        // Both writes were real when they happened, but the frame ends where it
        // began — nobody should be woken for `name`.
        expect(deliver(writer, slot) & nameBit).toBe(0);
        expect(slot.item?.name).toBe('a');
    });

    it('still publishes when a field changes twice and lands elsewhere', () => {
        const writer = makeWriter();
        const slot = makeSlot();
        const nameBit = writer.fields.bitOf('name');

        writer.write(slot, { name: 'b' });
        markDirty(slot);
        writer.write(slot, { name: 'c' });

        expect(deliver(writer, slot) & nameBit).toBe(nameBit);
        expect(slot.item?.name).toBe('c');
    });

    it('keeps an unrelated field that really changed alongside a reverted one', () => {
        const writer = makeWriter();
        const slot = makeSlot();
        const nameBit = writer.fields.bitOf('name');
        const activeBit = writer.fields.bitOf('active');

        writer.write(slot, { name: 'b', active: false });
        markDirty(slot);
        writer.write(slot, { name: 'a' });

        const effective = deliver(writer, slot);
        expect(effective & nameBit).toBe(0); // reverted
        expect(effective & activeBit).toBe(activeBit); // genuinely changed
    });

    it('treats the first write into an empty slot as changing every patched field', () => {
        const writer = makeWriter();
        const slot: TOIMEntitySlot<TUser, string> = { pk: 'u2', item: undefined };

        expect(writer.write(slot, { name: 'x' })).toBe(true);
        expect(slot.dirtyFields).toBe(writer.fields.bitOf('name'));
    });

    it('accumulates fields across several writes in one flush', () => {
        const writer = makeWriter();
        const slot = makeSlot();
        const nameBit = writer.fields.bitOf('name');
        const teamBit = writer.fields.bitOf('teamId');

        writer.write(slot, { name: 'b' });
        markDirty(slot);
        writer.write(slot, { teamId: 't9' });

        const effective = deliver(writer, slot);
        expect(effective & nameBit).toBe(nameBit);
        expect(effective & teamBit).toBe(teamBit);
    });

    it('rejects an in-place updater instead of silently going deaf', () => {
        // With in-place mutation the flush snapshot and the live entity are the
        // same object, so every comparison would say "unchanged" and the writer
        // would suppress real changes too.
        expect(
            () =>
                new OIMSlotWriterFieldMasked<TUser, string>(
                    new OIMEventQueue(),
                    createInPlaceEntityUpdater<TUser>()
                )
        ).toThrow(/in-place/i);
    });

    it('leaves the plain writer publishing everything', () => {
        const writer = new OIMSlotWriter<TUser, string>(
            createMergeEntityUpdater<TUser>()
        );
        const slot = makeSlot();

        // Same value, no field tracking: still published, as before.
        expect(writer.write(slot, { name: 'a' })).toBe(true);
        // …and it records nothing, so there is no mask to read.
        expect(slot.dirtyFields).toBeUndefined();
        expect(writer.fields).toBeUndefined();
    });
});
