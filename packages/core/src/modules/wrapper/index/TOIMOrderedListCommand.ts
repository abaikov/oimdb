import { TOIMPk } from '../../../type/TOIMPk';

export type TOIMOrderedListCommand<TPk extends TOIMPk> =
    | {
          type: 'add';
          key: TPk;
          index: number;
      }
    | {
          type: 'remove';
          key: TPk;
          index: number;
      }
    | {
          type: 'move';
          key: TPk;
          fromIndex: number;
          toIndex: number;
      }
    | {
          type: 'reset';
          keys: readonly TPk[];
      };
