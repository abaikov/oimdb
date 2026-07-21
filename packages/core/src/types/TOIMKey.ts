import { TOIMPk } from './TOIMPk';
import { TOIMKeyPath } from './TOIMKeyPath';

/**
 * The key bound shared by every keyed node (index, keyed emitter, carrier
 * resolver): either a single primitive PK (`TOIMPk`) or a composite key path
 * (`TOIMKeyPath`).
 *
 * It exists purely to widen the generic bound from `TOIMPk` to also admit
 * `TOIMKeyPath`, so the composite (trie-backed) index can reuse the exact same
 * emitter / reactive-index machinery. It is a compile-time bound only — nothing
 * branches on it at runtime, and primitive-keyed nodes keep their native-Map
 * fast path untouched.
 */
export type TOIMKey = TOIMPk | TOIMKeyPath;
