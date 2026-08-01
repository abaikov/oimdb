import { TOIMPk } from '../types/TOIMPk';
import { TOIMKeyPath } from '../types/TOIMKeyPath';

/**
 * Builds a composite key in its TUPLE form — the positional `TOIMKeyPath` that trie-backed stores
 * and composite indexes are keyed by — out of named fields.
 *
 * A composite key can be spelled in more than one way; this builds exactly one of them, and nothing
 * else: it does not wrap a collection, does not cache and does not invalidate.
 *
 * What it buys is that the segment ORDER exists in one place instead of being restated, by
 * convention, at every call site. Both sides then derive from it — `selectPk` hands it the entity, a
 * lookup hands it an object carrying the same fields — so a renamed or missing segment is a compile
 * error instead of a silently different bucket. With same-typed segments a swapped pair is otherwise
 * caught by nothing at all.
 *
 * ```ts
 * type TCardKeys = { boardId: string; cardId: string };
 * const cardKey = ctk<TCardKeys>()(['boardId', 'cardId']);   // ctk — create tuple key
 *
 * const cards = new OIMReactiveCollection<Card, TOIMKeyPath>(queue, {
 *     selectPk: card => cardKey(card),                 // the entity carries those fields
 *     store: new OIMCollectionStoreTrieDriven<Card>(),
 * });
 *
 * cards.getOneByPk(cardKey({ boardId: 'b1', cardId: 'c9' }));
 * ```
 *
 * It is parameterised by the KEY type rather than the entity: with every value already a `TOIMPk`,
 * the projection needs no type assertion anywhere. An entity satisfies it structurally, so the same
 * factory serves `selectPk` and every lookup.
 *
 * `create` allocates one small array, so call it where the fields CHANGE — a lookup against a ready
 * tuple walks the trie without allocating at all.
 *
 * Note what it is not: this produces ONE key made of several segments. An index whose selector
 * returns several keys files one entity under each of them — the opposite relationship.
 */
export class OIMCompositeKeyTupleFactory<
    TKeys extends Record<string, TOIMPk>,
    TName extends keyof TKeys & string,
> {
    private readonly names: readonly TName[];

    constructor(names: readonly TName[]) {
        if (names.length === 0) {
            throw new Error(
                'OIMCompositeKeyTupleFactory: at least one segment name is required.'
            );
        }
        if (new Set(names).size !== names.length) {
            throw new Error(
                `OIMCompositeKeyTupleFactory: duplicate segment name in [${names.join(', ')}] — ` +
                    'each segment must be addressable unambiguously.'
            );
        }
        this.names = names;
    }

    /** Number of segments in every tuple this produces. */
    public get arity(): number {
        return this.names.length;
    }

    /**
     * Any object carrying the declared fields — the entity itself, or a parameters object.
     *
     * An arrow property, not a method, so it can be handed out on its own: `ctk` returns THIS and
     * nothing else, and callers write `cardKey(fields)` instead of `cardKey.create(fields)`. It reads
     * only the captured names, so detaching it costs no correctness.
     */
    public readonly create = (source: Pick<TKeys, TName>): TOIMKeyPath => {
        const { names } = this;
        const tuple: TOIMPk[] = new Array(names.length);
        for (let i = 0; i < names.length; i++) {
            tuple[i] = source[names[i]];
        }
        return tuple;
    };
}
