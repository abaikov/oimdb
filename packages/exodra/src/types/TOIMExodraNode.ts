import type { TExoBaseNodeFields, TExoNode } from '@exodra/core';
import type { TExoDomMark } from '@exodra/dom';

export type TOIMExodraNode = TExoNode<TExoDomMark> & Pick<TExoBaseNodeFields, 'serviceState'> & { unmount(): void };
