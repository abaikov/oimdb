import type { IOIMDevRegistry } from '../interfaces/IOIMDevRegistry';
import type { IOIMDevStateSource } from '../interfaces/IOIMDevStateSource';

export class OIMDevRegistryStateSource implements IOIMDevStateSource {
    constructor(private readonly devRegistry: IOIMDevRegistry) {}

    public readInspect(): Promise<unknown> {
        return Promise.resolve(this.devRegistry.inspect());
    }

    public readDump(): Promise<string> {
        return Promise.resolve(this.devRegistry.dumpString());
    }
}
