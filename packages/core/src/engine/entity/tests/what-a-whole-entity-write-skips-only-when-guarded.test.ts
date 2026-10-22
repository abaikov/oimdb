import { oimPutEntityColumns } from '../utils/oimPutEntityColumns';
import { oimPutEntityColumnsGuarded } from '../utils/oimPutEntityColumnsGuarded';
import { oimSameValueZeroGuard } from '../../slot/utils/oimSameValueZeroGuard';
import { createOIMEntityWriterInPlace } from '../../../factories/createOIMEntityWriterInPlace';
import type { TOIMEntitySlot } from '../types/TOIMEntitySlot';

class StoredCard {
    public constructor(public id: string) {}
}
Object.defineProperty(StoredCard.prototype, 'inherited', { value: 'from the prototype', enumerable: true, writable: true });

const slotHolding = (entity: object): TOIMEntitySlot => ({ entity } as unknown as TOIMEntitySlot);
const copyOf = (entity: Record<string, unknown>): Record<string, unknown> => ({ ...entity });

describe('a whole-entity write over a stored entity that inherits a column', () => {
    it('takes the inherited column away by default, with no guard', () => {
        const changedColumnNames: string[] = [];
        oimPutEntityColumns(slotHolding(new StoredCard('a')), { id: 'a' }, oimSameValueZeroGuard, changedColumnNames, copyOf);
        expect(changedColumnNames).toEqual(['inherited']);
    });

    it('leaves the inherited column alone when the guarded put is chosen', () => {
        const changedColumnNames: string[] = [];
        oimPutEntityColumnsGuarded(slotHolding(new StoredCard('a')), { id: 'a' }, oimSameValueZeroGuard, changedColumnNames, copyOf);
        expect(changedColumnNames).toEqual([]);
    });

    it('is picked once, at the writer\'s construction', () => {
        const unguardedChanges: string[] = [];
        const guardedChanges: string[] = [];
        createOIMEntityWriterInPlace().putEntity(slotHolding(new StoredCard('a')), { id: 'a' }, unguardedChanges);
        createOIMEntityWriterInPlace({ putEntityColumns: oimPutEntityColumnsGuarded })
            .putEntity(slotHolding(new StoredCard('a')), { id: 'a' }, guardedChanges);
        expect([unguardedChanges, guardedChanges]).toEqual([['inherited'], []]);
    });
});
