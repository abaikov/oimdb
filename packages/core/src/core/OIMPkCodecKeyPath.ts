import { TOIMKeyPath } from '../types/TOIMKeyPath';
import { TOIMPk } from '../types/TOIMPk';
import { IOIMPkCodec } from '../interfaces/IOIMPkCodec';

/**
 * Opt-in `IOIMPkCodec` for composite key paths at serialization boundaries. Uses
 * a JSON array encoding, which is collision-safe (a segment containing the
 * delimiter cannot forge a boundary the way `"a|b"` concatenation can) and
 * preserves each segment's JSON type, so `decode(encode(pk))` round-trips
 * `string`/`number` segments exactly.
 *
 * It is NOT a default — pass it explicitly where a boundary needs to key a
 * composite PK by string (Redux state, persist storage, snapshots).
 */
export class OIMPkCodecKeyPath implements IOIMPkCodec<TOIMKeyPath> {
    public encode(pk: TOIMKeyPath): string {
        return JSON.stringify(pk);
    }

    public decode(encoded: string): TOIMKeyPath {
        return JSON.parse(encoded) as readonly TOIMPk[];
    }
}
