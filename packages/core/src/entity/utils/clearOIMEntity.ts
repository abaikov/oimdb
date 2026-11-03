import type { OIMEntitySlot } from '../OIMEntitySlot';
import type { TOIMEditable } from '../../slot/types/TOIMEditable';

export function clearOIMEntity(entitySlot: OIMEntitySlot): void {
    (entitySlot as TOIMEditable<OIMEntitySlot>).content = undefined;
}
