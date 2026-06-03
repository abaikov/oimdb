import { TOIMPk } from '@oimdb/core';
import { OIMPersistor, TOIMPersistorOptions } from '../core/OIMPersistor';
import { OIMPersistResource } from '../core/OIMPersistResource';
import {
    createArrayIndexSourceAdapter,
    createCollectionSourceAdapter,
    createObjectSourceAdapter,
    createOrderedArrayIndexSourceAdapter,
    createSetIndexSourceAdapter,
    TOIMArrayIndexPersistSource,
    TOIMCollectionPersistSnapshot,
    TOIMCollectionPersistSource,
    TOIMIndexPersistSnapshot,
    TOIMObjectPersistSnapshot,
    TOIMObjectPersistSource,
    TOIMOrderedArrayIndexPersistSource,
    TOIMSetIndexPersistSource,
} from '../core/OIMSourceAdapters';
import { TOIMPersistStrategy } from '../types/TOIMPersistResource';

export type TOIMLocalStorageLike = {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
};

export type TOIMLocalStorageRuntime = {
    storage: TOIMLocalStorageLike;
    serialize(value: unknown): string;
    deserialize(value: string): unknown;
};

export type TOIMLocalStoragePersistorOptions = Omit<
    TOIMPersistorOptions<TOIMLocalStorageRuntime>,
    'storage'
> & {
    storage?: TOIMLocalStorageLike;
    serialize?: (value: unknown) => string;
    deserialize?: (value: string) => unknown;
};

export type TOIMLocalStorageEntryOptions = {
    storageKey: string;
};

export type TOIMLocalStoragePathOptions = {
    storageKey: string;
    path: readonly string[];
};

/**
 * Extended strategy interface for atomic batch writes. All built-in localStorage
 * strategies implement this. Custom strategies via `.using()` fall back to
 * sequential writes.
 */
export type TOIMLocalStorageBatchStrategy<TSnapshot> = TOIMPersistStrategy<
    OIMLocalStoragePersistor,
    TSnapshot
> & {
    readonly storageKeys: readonly string[];
    writeToRoots(roots: Map<string, unknown>, toDelete: Set<string>, snapshot: TSnapshot): void;
    clearFromRoots(roots: Map<string, unknown>, toDelete: Set<string>): void;
};

export class OIMLocalStoragePersistor extends OIMPersistor<TOIMLocalStorageRuntime> {
    constructor(options: TOIMLocalStoragePersistorOptions = {}) {
        const storage = options.storage ?? globalThis.localStorage;
        if (!storage) {
            throw new Error('[OIMPersist]: localStorage is not available in this environment.');
        }
        super({
            ...options,
            storage: {
                storage,
                serialize: options.serialize ?? (v => JSON.stringify(v)),
                deserialize: options.deserialize ?? (v => JSON.parse(v)),
            },
        });
    }

    public collection<TEntity extends object, TPk extends TOIMPk>(
        collection: TOIMCollectionPersistSource<TEntity, TPk>
    ): OIMLocalStorageCollectionResourceBuilder<TEntity, TPk> {
        return new OIMLocalStorageCollectionResourceBuilder(this, collection);
    }

    public object<TKey extends string, TValue>(
        object: TOIMObjectPersistSource<TKey, TValue>
    ): OIMLocalStorageObjectResourceBuilder<TKey, TValue> {
        return new OIMLocalStorageObjectResourceBuilder(this, object);
    }

    public setIndex<TKey extends TOIMPk, TPk extends TOIMPk>(
        index: TOIMSetIndexPersistSource<TKey, TPk>
    ): OIMLocalStorageIndexResourceBuilder<TKey, TPk> {
        return new OIMLocalStorageIndexResourceBuilder(this, createSetIndexSourceAdapter(index));
    }

    public arrayIndex<TKey extends TOIMPk, TPk extends TOIMPk>(
        index: TOIMArrayIndexPersistSource<TKey, TPk>
    ): OIMLocalStorageIndexResourceBuilder<TKey, TPk> {
        return new OIMLocalStorageIndexResourceBuilder(this, createArrayIndexSourceAdapter(index));
    }

    public orderedArrayIndex<TKey extends TOIMPk, TPk extends TOIMPk>(
        index: TOIMOrderedArrayIndexPersistSource<TKey, TPk>
    ): OIMLocalStorageIndexResourceBuilder<TKey, TPk> {
        return new OIMLocalStorageIndexResourceBuilder(this, createOrderedArrayIndexSourceAdapter(index));
    }

    protected override async batchPersist(
        resources: readonly OIMPersistResource<any, any, any>[]
    ): Promise<void> {
        const batchItems: Array<{
            strategy: TOIMLocalStorageBatchStrategy<unknown>;
            snapshot: unknown;
            resource: OIMPersistResource<any, any, any>;
        }> = [];
        const fallbackItems: Array<{
            strategy: TOIMPersistStrategy<any, any>;
            snapshot: unknown;
            resource: OIMPersistResource<any, any, any>;
        }> = [];

        for (const resource of resources) {
            const snapshot = resource.takeSnapshot();
            const strategy = resource.strategy as TOIMLocalStorageBatchStrategy<unknown>;
            if (typeof strategy.storageKeys !== 'undefined') {
                batchItems.push({ strategy, snapshot, resource });
            } else {
                fallbackItems.push({ strategy: resource.strategy, snapshot, resource });
            }
        }

        if (batchItems.length > 0) {
            const allKeys = new Set<string>();
            for (const { strategy } of batchItems) {
                for (const key of strategy.storageKeys) allKeys.add(key);
            }

            const roots = new Map<string, unknown>();
            const toDelete = new Set<string>();
            for (const key of allKeys) {
                const raw = this.storage.storage.getItem(key);
                if (raw !== null) roots.set(key, this.storage.deserialize(raw));
            }

            try {
                for (const { strategy, snapshot } of batchItems) {
                    strategy.writeToRoots(roots, toDelete, snapshot);
                }

                for (const [key, value] of roots) {
                    if (!toDelete.has(key)) {
                        this.storage.storage.setItem(key, this.storage.serialize(value));
                    }
                }
                for (const key of toDelete) {
                    this.storage.storage.removeItem(key);
                }
            } catch (error) {
                if (this.onError) {
                    for (const { resource } of batchItems) {
                        this.onError(error, { resource, operation: 'persist' });
                    }
                } else {
                    throw error;
                }
            }
        }

        for (const { strategy, snapshot, resource } of fallbackItems) {
            try {
                await strategy.write(this, snapshot);
            } catch (error) {
                if (this.onError) {
                    this.onError(error, { resource, operation: 'persist' });
                } else {
                    throw error;
                }
            }
        }
    }
}

export function createLocalStoragePersistor(
    options: TOIMLocalStoragePersistorOptions = {}
): OIMLocalStoragePersistor {
    return new OIMLocalStoragePersistor(options);
}

export class OIMLocalStorageCollectionResourceBuilder<TEntity extends object, TPk extends TOIMPk> {
    constructor(
        private readonly persistor: OIMLocalStoragePersistor,
        private readonly collection: TOIMCollectionPersistSource<TEntity, TPk>
    ) {}

    public entry(options: TOIMLocalStorageEntryOptions) {
        return this.persistor.addResource(new OIMPersistResource({
            source: createCollectionSourceAdapter(this.collection),
            strategy: createLocalStorageEntryStrategy<TOIMCollectionPersistSnapshot<TPk, TEntity>>(options),
        }));
    }

    public path(options: TOIMLocalStoragePathOptions) {
        return this.persistor.addResource(new OIMPersistResource({
            source: createCollectionSourceAdapter(this.collection),
            strategy: createLocalStoragePathStrategy<TOIMCollectionPersistSnapshot<TPk, TEntity>>(options),
        }));
    }

    public using<TPersistedSnapshot>(strategy: TOIMPersistStrategy<OIMLocalStoragePersistor, TPersistedSnapshot>) {
        return this.persistor.addResource(new OIMPersistResource({
            source: createCollectionSourceAdapter(this.collection),
            strategy,
        }));
    }
}

export class OIMLocalStorageObjectResourceBuilder<TKey extends string, TValue> {
    constructor(
        private readonly persistor: OIMLocalStoragePersistor,
        private readonly object: TOIMObjectPersistSource<TKey, TValue>
    ) {}

    public entry(options: TOIMLocalStorageEntryOptions) {
        return this.persistor.addResource(new OIMPersistResource({
            source: createObjectSourceAdapter(this.object),
            strategy: createLocalStorageEntryStrategy<TOIMObjectPersistSnapshot<TKey, TValue>>(options),
        }));
    }

    public path(options: TOIMLocalStoragePathOptions) {
        return this.persistor.addResource(new OIMPersistResource({
            source: createObjectSourceAdapter(this.object),
            strategy: createLocalStoragePathStrategy<TOIMObjectPersistSnapshot<TKey, TValue>>(options),
        }));
    }
}

export class OIMLocalStorageIndexResourceBuilder<TKey extends TOIMPk, TPk extends TOIMPk> {
    constructor(
        private readonly persistor: OIMLocalStoragePersistor,
        private readonly source: ReturnType<typeof createSetIndexSourceAdapter<TKey, TPk>>
    ) {}

    public entry(options: TOIMLocalStorageEntryOptions) {
        return this.persistor.addResource(new OIMPersistResource({
            source: this.source,
            strategy: createLocalStorageEntryStrategy<TOIMIndexPersistSnapshot<TKey, TPk>>(options),
        }));
    }

    public path(options: TOIMLocalStoragePathOptions) {
        return this.persistor.addResource(new OIMPersistResource({
            source: this.source,
            strategy: createLocalStoragePathStrategy<TOIMIndexPersistSnapshot<TKey, TPk>>(options),
        }));
    }
}

export function createLocalStorageEntryStrategy<TSnapshot>(
    options: TOIMLocalStorageEntryOptions
): TOIMLocalStorageBatchStrategy<TSnapshot> {
    const { storageKey } = options;
    return {
        storageKeys: [storageKey],
        async read(p) {
            const raw = p.storage.storage.getItem(storageKey);
            return raw === null ? undefined : (p.storage.deserialize(raw) as TSnapshot);
        },
        async write(p, snapshot) {
            p.storage.storage.setItem(storageKey, p.storage.serialize(snapshot));
        },
        async clear(p) {
            p.storage.storage.removeItem(storageKey);
        },
        writeToRoots(roots, toDelete, snapshot) {
            roots.set(storageKey, snapshot);
            toDelete.delete(storageKey);
        },
        clearFromRoots(_roots, toDelete) {
            toDelete.add(storageKey);
        },
    };
}

export function createLocalStoragePathStrategy<TSnapshot>(
    options: TOIMLocalStoragePathOptions
): TOIMLocalStorageBatchStrategy<TSnapshot> {
    const { storageKey, path } = options;
    return {
        storageKeys: [storageKey],
        async read(p) {
            const root = readRoot(p, storageKey);
            return getPath(root, path) as TSnapshot | undefined;
        },
        async write(p, snapshot) {
            const root = readRoot(p, storageKey) ?? {};
            setPath(root, path, snapshot);
            p.storage.storage.setItem(storageKey, p.storage.serialize(root));
        },
        async clear(p) {
            const root = readRoot(p, storageKey);
            if (!root) return;
            deletePath(root, path);
            p.storage.storage.setItem(storageKey, p.storage.serialize(root));
        },
        writeToRoots(roots, toDelete, snapshot) {
            let root = roots.get(storageKey) as Record<string, unknown> | undefined;
            if (!root || typeof root !== 'object') root = {};
            setPath(root, path, snapshot);
            roots.set(storageKey, root);
            toDelete.delete(storageKey);
        },
        clearFromRoots(roots) {
            const root = roots.get(storageKey) as Record<string, unknown> | undefined;
            if (!root) return;
            deletePath(root, path);
            roots.set(storageKey, root);
        },
    };
}

function readRoot(p: OIMLocalStoragePersistor, storageKey: string): Record<string, unknown> | undefined {
    const raw = p.storage.storage.getItem(storageKey);
    return raw === null ? undefined : (p.storage.deserialize(raw) as Record<string, unknown>);
}

function getPath(root: unknown, path: readonly string[]): unknown {
    let node = root as Record<string, unknown> | undefined;
    for (let i = 0; i < path.length; i++) {
        if (!node || typeof node !== 'object') return undefined;
        node = node[path[i]] as Record<string, unknown> | undefined;
    }
    return node;
}

function setPath(root: Record<string, unknown>, path: readonly string[], value: unknown): void {
    let node = root;
    for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        if (!node[key] || typeof node[key] !== 'object') node[key] = {};
        node = node[key] as Record<string, unknown>;
    }
    node[path[path.length - 1]] = value;
}

function deletePath(root: Record<string, unknown>, path: readonly string[]): void {
    let node = root;
    for (let i = 0; i < path.length - 1; i++) {
        const next = node[path[i]];
        if (!next || typeof next !== 'object') return;
        node = next as Record<string, unknown>;
    }
    delete node[path[path.length - 1]];
}
