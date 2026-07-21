import { TOIMKey } from '../types/TOIMKey';
import { IOIMCarrierProvider } from './OIMCarrierKeyedEmitter';
import { IOIMKeyCarrier } from '../interfaces/IOIMKeyCarrier';

/**
 * Backs the index keyed emitter: maps each index key to a small carrier object
 * that holds that key's subscribers + dirty flag. Carriers are created on first
 * subscribe (`getOrReserveCarrier`) and pruned when their last subscriber
 * leaves (`onCarrierEmptied`) — mirroring the old per-key handler map, so a
 * churning key space does not leak carriers.
 */
export class OIMKeyedCarrierProvider<TKey extends TOIMKey>
    implements IOIMCarrierProvider<TKey, IOIMKeyCarrier<TKey>>
{
    private readonly carriers = new Map<TKey, IOIMKeyCarrier<TKey>>();

    public getOrReserveCarrier(key: TKey): IOIMKeyCarrier<TKey> {
        let carrier = this.carriers.get(key);
        if (!carrier) {
            carrier = { key };
            this.carriers.set(key, carrier);
        }
        return carrier;
    }

    public findCarrier(key: TKey): IOIMKeyCarrier<TKey> | undefined {
        return this.carriers.get(key);
    }

    public onCarrierEmptied(carrier: IOIMKeyCarrier<TKey>): void {
        this.carriers.delete(carrier.key);
    }
}
