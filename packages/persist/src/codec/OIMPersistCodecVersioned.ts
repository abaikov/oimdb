import type { IOIMPersistCodec } from './interfaces/IOIMPersistCodec';
import type { TOIMPersistCodecVersionedOptions } from './types/TOIMPersistCodecVersionedOptions';
import type { TOIMPersistVersionedShape } from './types/TOIMPersistVersionedShape';

export class OIMPersistCodecVersioned<TSourceSnapshot, TPersistedSnapshot>
implements IOIMPersistCodec<TSourceSnapshot, TOIMPersistVersionedShape> {
    private readonly version: number;
    private readonly migrations: Readonly<Record<number, (data: unknown) => unknown>>;
    private readonly migrationVersions: readonly number[];
    private readonly persistCodec: IOIMPersistCodec<TSourceSnapshot, TPersistedSnapshot>;

    public constructor(persistCodecVersionedOptions: TOIMPersistCodecVersionedOptions<TSourceSnapshot, TPersistedSnapshot>) {
        this.version = persistCodecVersionedOptions.version;
        this.migrations = persistCodecVersionedOptions.migrations;
        this.persistCodec = persistCodecVersionedOptions.persistCodec;
        this.migrationVersions = Object.keys(this.migrations)
            .map(Number)
            .filter(migrationVersion => migrationVersion <= this.version)
            .sort((left, right) => left - right);
    }

    public encode(sourceSnapshot: TSourceSnapshot): TOIMPersistVersionedShape {
        return { version: this.version, data: this.persistCodec.encode(sourceSnapshot) };
    }

    public decode(persistVersionedShape: TOIMPersistVersionedShape): TSourceSnapshot {
        if (persistVersionedShape.version > this.version) {
            throw new Error(
                `OIMPersistCodecVersioned.decode: the stored value is version ${persistVersionedShape.version}, newer than `
                + `this codec's version ${this.version}, and no migration leads back down. The value was not decoded.`,
            );
        }
        let data = persistVersionedShape.data;
        const migrationVersions = this.migrationVersions;
        for (let i = 0; i < migrationVersions.length; i++) {
            const migrationVersion = migrationVersions[i];
            if (migrationVersion > persistVersionedShape.version) data = this.migrations[migrationVersion](data);
        }
        return this.persistCodec.decode(data as TPersistedSnapshot);
    }
}
