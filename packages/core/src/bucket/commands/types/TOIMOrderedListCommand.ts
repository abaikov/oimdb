import type { TOIMSlot } from '../../../slot/types/TOIMSlot';

export type TOIMOrderedListCommand =
    | { type: 'insert'; index: number; slot: TOIMSlot }
    | { type: 'remove'; index: number }
    | { type: 'move'; from: number; to: number }
    | { type: 'reset'; slots: readonly TOIMSlot[] };
