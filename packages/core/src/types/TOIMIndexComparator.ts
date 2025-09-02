import { TOIMPk } from './TOIMPk';

/**
 * Comparator function for index primary key arrays.
 * Returns true if the arrays are considered equal, false if they differ. */
export type TOIMIndexComparator<TPk extends TOIMPk> = (
    existingPks: readonly TPk[],
    newPks: readonly TPk[]
) => boolean;
