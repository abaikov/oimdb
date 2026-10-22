import type { TExoListOp } from '@exodra/reactivity-types';
import type { TOIMEntitySlot, TOIMOrderedListCommand, TOIMSlot } from '@oimdb/core';

export class OIMExoListSchemas<TSchema, TBucketMemberSlot extends TOIMSlot = TOIMEntitySlot> {
    private readonly schemas = new WeakMap<TBucketMemberSlot, TSchema>();

    public constructor(private readonly render: (slot: TBucketMemberSlot) => TSchema) {}

    /** `has` only after an empty `get`, so a schema that IS `undefined` still caches. */
    public schemaFor(slot: TBucketMemberSlot): TSchema {
        const held = this.schemas.get(slot);
        if (held !== undefined || this.schemas.has(slot)) return held as TSchema;
        const made = this.render(slot);
        this.schemas.set(slot, made);
        return made;
    }

    public snapshotOf(slots: readonly TBucketMemberSlot[]): readonly TSchema[] {
        const out: TSchema[] = new Array(slots.length);
        for (let i = 0; i < slots.length; i++) out[i] = this.schemaFor(slots[i]);
        return out;
    }

    public opFor(command: TOIMOrderedListCommand): TExoListOp<TSchema> {
        switch (command.type) {
            case 'insert':
                return { type: 'insert', index: command.index, item: this.schemaFor(command.slot as TBucketMemberSlot) };
            case 'remove':
                return { type: 'remove', index: command.index };
            case 'move':
                return { type: 'move', from: command.from, to: command.to };
            case 'reset':
                return { type: 'reset', items: this.snapshotOf(command.slots as readonly TBucketMemberSlot[]) };
        }
    }
}
