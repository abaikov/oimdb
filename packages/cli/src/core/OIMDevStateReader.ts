import type { IOIMDevStateSource } from '../interfaces/IOIMDevStateSource';
import type { TOIMDevInspectSnapshot } from '../types/TOIMDevInspectSnapshot';

export class OIMDevStateReader {
    constructor(private readonly devStateSource: IOIMDevStateSource) {}

    public async readInspectText(): Promise<string> {
        return JSON.stringify(await this.devStateSource.readInspect(), null, 2);
    }

    public readDumpText(): Promise<string> {
        return this.devStateSource.readDump();
    }

    public async readCollectionText(name: string): Promise<string> {
        const { collections } = await this.devStateSource.readInspect() as TOIMDevInspectSnapshot;
        const collection = collections[name];
        if (collection === undefined) return `Collection '${name}' not found. Registered: ${this.namesOf(collections)}`;
        return JSON.stringify(collection, null, 2);
    }

    public async readComputedText(name: string): Promise<string> {
        const { computeds } = await this.devStateSource.readInspect() as TOIMDevInspectSnapshot;
        const computed = computeds[name];
        if (computed === undefined) return `Computed '${name}' not found. Registered: ${this.namesOf(computeds)}`;
        return JSON.stringify(computed, null, 2);
    }

    private namesOf(entries: Record<string, unknown>): string {
        return Object.keys(entries).join(', ') || '(none registered)';
    }
}
