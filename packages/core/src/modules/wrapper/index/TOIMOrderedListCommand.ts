import { TOIMPk } from '../../../types/TOIMPk';
import { TOIMEntitySlot } from '../../../types/TOIMEntitySlot';

export type TOIMOrderedListCommand<
    TPk extends TOIMPk,
    TEntity extends object = object,
> =
    | {
          type: 'insert';
          pk: TPk;
          slot: TOIMEntitySlot<TEntity, TPk>;
          index: number;
      }
    | {
          type: 'remove';
          pk: TPk;
          slot: TOIMEntitySlot<TEntity, TPk>;
          index: number;
      }
    | {
          type: 'move';
          pk: TPk;
          slot: TOIMEntitySlot<TEntity, TPk>;
          fromIndex: number;
          toIndex: number;
      }
    | {
          /**
           * Replace the whole list for this key (preferred name).
           */
          type: 'set';
          pks: readonly TPk[];
          slots: readonly TOIMEntitySlot<TEntity, TPk>[];
      };
