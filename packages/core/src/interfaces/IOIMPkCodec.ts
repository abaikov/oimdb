import { TOIMKey } from '../types/TOIMKey';

/**
 * Projects a PK to/from a string, for the serialization boundaries that can only
 * key state by a string: the Redux adapter (state object keyed by id), persist
 * storage, JSON snapshots. In-memory core never needs this — it keys PKs by
 * content via a trie — but a composite PK path cannot be a string key, so those
 * boundaries require a codec.
 *
 * There is intentionally NO default codec for composite keys: a hidden
 * `JSON.stringify` would silently couple correctness to key order / escaping.
 * Callers pass one explicitly (`OIMPkCodecKeyPath` is a ready opt-in for paths).
 */
export interface IOIMPkCodec<TPk extends TOIMKey> {
    encode(pk: TPk): string;
    decode(encoded: string): TPk;
}
