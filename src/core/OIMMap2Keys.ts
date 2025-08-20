export class OIMMap2Keys<K1, K2, V> {
    private map = new Map<K1, Map<K2, V>>();
    private _size = 0;

    get size() {
        return this._size;
    }

    set(k1: K1, k2: K2, v: V) {
        let m = this.map.get(k1);
        if (!m) {
            m = new Map<K2, V>();
            this.map.set(k1, m);
        }
        if (!m.has(k2)) this._size++;
        m.set(k2, v);
    }

    get(k1: K1, k2: K2) {
        return this.map.get(k1)?.get(k2);
    }

    has(k1: K1, k2: K2) {
        return this.map.get(k1)?.has(k2);
    }

    delete(k1: K1, k2: K2) {
        const m = this.map.get(k1);
        if (!m) return false;
        const had = m.delete(k2);
        if (had) {
            this._size--;
            if (m.size === 0) this.map.delete(k1);
        }
        return had;
    }

    clear() {
        this.map.clear();
        this._size = 0;
    }
}
