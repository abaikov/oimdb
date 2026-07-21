import { IOIMCarrierResolver } from './OIMCarrierKeyedEmitter';
import { IOIMKeyCarrier } from '../interfaces/IOIMKeyCarrier';
import { TOIMPk } from '../types/TOIMPk';
import { TOIMKeyPath } from '../types/TOIMKeyPath';
import { OIMTrieMap } from './OIMTrieMap';

/**
 * Composite-key counterpart of `OIMKeyedCarrierResolver`: backs the index keyed
 * emitter for key paths. Maps each key path to a carrier holding that path's
 * subscribers + dirty flag, via a trie (`OIMTrieMap`) so a freshly built
 * `[a, b, c]` resolves to the same carrier as the one subscribed earlier.
 *
 * Carriers are created on first subscribe (`getOrReserveCarrier`) and pruned
 * when their last subscriber leaves (`onCarrierEmptied`) — the trie drops the
 * empty branch, so a churning key-path space does not leak carriers.
 */
export class OIMKeyPathCarrierResolver
    implements IOIMCarrierResolver<TOIMKeyPath, IOIMKeyCarrier<TOIMKeyPath>>
{
    private readonly carriers = new OIMTrieMap<
        TOIMPk,
        IOIMKeyCarrier<TOIMKeyPath>
    >();

    public getOrReserveCarrier(
        key: TOIMKeyPath
    ): IOIMKeyCarrier<TOIMKeyPath> {
        let carrier = this.carriers.get(key);
        if (!carrier) {
            carrier = { key };
            this.carriers.set(key, carrier);
        }
        return carrier;
    }

    public findCarrier(
        key: TOIMKeyPath
    ): IOIMKeyCarrier<TOIMKeyPath> | undefined {
        return this.carriers.get(key);
    }

    public onCarrierEmptied(carrier: IOIMKeyCarrier<TOIMKeyPath>): void {
        this.carriers.delete(carrier.key);
    }
}
