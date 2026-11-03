import type { IOIMDevStateSource } from '../interfaces/IOIMDevStateSource';

export class OIMDevHttpStateSource implements IOIMDevStateSource {
    constructor(private readonly serverUrl: string) {}

    public async readInspect(): Promise<unknown> {
        return (await this.readConnected('/api/inspect')).data;
    }

    public async readDump(): Promise<string> {
        return (await this.readConnected('/api/dump')).data as string;
    }

    private async readConnected(path: string): Promise<{ connected: boolean; data: unknown }> {
        let response: Response;
        try {
            response = await fetch(`${this.serverUrl}${path}`);
        } catch {
            throw new Error(`[OIMDB] No "oimdb serve" at ${this.serverUrl}. Start it with: npx @oimdb/cli serve`);
        }
        const body = await response.json() as { connected: boolean; data: unknown };
        if (!body.connected) {
            throw new Error(
                `[OIMDB] "oimdb serve" at ${this.serverUrl} has no browser tab connected. `
                + 'Add OIM_DEV_REGISTRY.connect() from @oimdb/devtools to the page and reload it.',
            );
        }
        return body;
    }
}
