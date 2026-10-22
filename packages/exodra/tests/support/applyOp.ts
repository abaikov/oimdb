import type { TExoListOp } from '@exodra/reactivity-types';

/**
 * What a consumer of a `bindableList` does: start from `snapshot()` and apply
 * every op. Kept as honestly as a real one — it never reads the bucket, which is
 * the whole point of the cases that use it.
 */
export function applyOp<T>(into: T[], op: TExoListOp<T>): void {
    switch (op.type) {
        case 'insert': into.splice(op.index, 0, op.item); break;
        case 'remove': into.splice(op.index, 1); break;
        case 'set': into[op.index] = op.item; break;
        case 'move': {
            const moved = into.splice(op.from, 1);
            into.splice(op.to, 0, moved[0]);
            break;
        }
        case 'reset':
            into.length = 0;
            into.push(...op.items);
            break;
    }
}
