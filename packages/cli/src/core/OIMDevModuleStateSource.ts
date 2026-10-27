import { pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';
import type { IOIMDevRegistry } from '../interfaces/IOIMDevRegistry';
import type { IOIMDevStateSource } from '../interfaces/IOIMDevStateSource';

export class OIMDevModuleStateSource implements IOIMDevStateSource {
    private devRegistry: Promise<IOIMDevRegistry> | undefined = undefined;

    constructor(private readonly modelModulePath: string) {}

    public async readInspect(): Promise<unknown> {
        return (await this.loadDevRegistry()).inspect();
    }

    public async readDump(): Promise<string> {
        return (await this.loadDevRegistry()).dumpString();
    }

    public loadDevRegistry(): Promise<IOIMDevRegistry> {
        this.devRegistry ??= this.importDevRegistry();
        return this.devRegistry;
    }

    private async importDevRegistry(): Promise<IOIMDevRegistry> {
        const url = pathToFileURL(resolvePath(this.modelModulePath)).href;
        const exported = (await import(url)) as Record<string, unknown>;
        let candidate: unknown = exported.oimDevRegistry ?? exported.default ?? exported;
        if (typeof candidate === 'function') candidate = await (candidate as () => unknown)();
        const devRegistry = candidate as IOIMDevRegistry | undefined;
        if (devRegistry === undefined || typeof devRegistry.inspect !== 'function' || typeof devRegistry.dumpString !== 'function') {
            throw new Error(
                `[OIMDB] Module "${this.modelModulePath}" must export a registry exposing inspect() and dumpString() `
                + '(as an "oimDevRegistry" or default export, or a zero-arg factory returning one).',
            );
        }
        return devRegistry;
    }
}
