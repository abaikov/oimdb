import { OIMSelector } from './OIMSelector';

/**
 * A selector whose value is a freshly built array.
 *
 * Every such selector rebuilds its array on each read, so the default
 * reference equality of {@link OIMSelector} would report a change on every
 * flush and wake every watcher. Positional comparison is what actually decides
 * whether anything moved, and it was copied verbatim into each array-valued
 * selector — seven times, drifting nowhere only by luck. It lives here now.
 *
 * Element identity is compared with `!==`: the arrays hold pks or entity
 * references, and an entity is replaced (not mutated) when it changes, so a
 * changed element is always a changed reference.
 */
export abstract class OIMSelectorArrayValued<TItem> extends OIMSelector<
    readonly TItem[]
> {
    protected areEqual(prev: readonly TItem[], next: readonly TItem[]): boolean {
        if (prev === next) return true;
        if (prev.length !== next.length) return false;
        for (let i = 0; i < prev.length; i++) {
            if (prev[i] !== next[i]) return false;
        }
        return true;
    }
}
