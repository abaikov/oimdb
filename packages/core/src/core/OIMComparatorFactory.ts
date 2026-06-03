import { TOIMComparator } from '../types/TOIMComparator';

export class OIMComparatorFactory<TEntity extends object> {
    createShallowComparator(): TOIMComparator<TEntity> {
        return (a, b) => {
            if (a === b) return false;

            const ka = Object.keys(a) as (keyof TEntity)[];
            const kb = Object.keys(b) as (keyof TEntity)[];

            if (ka.length !== kb.length) return true;

            for (let i = 0; i < ka.length; i++) {
                const k = ka[i];
                if (
                    (b as unknown as Record<string, unknown>)[k as string] !==
                    (a as unknown as Record<string, unknown>)[k as string]
                )
                    return true;
            }

            return false;
        };
    }
}
