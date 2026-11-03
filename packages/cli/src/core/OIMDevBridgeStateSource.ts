import type { IOIMDevStateSource } from '../interfaces/IOIMDevStateSource';
import type { OIMDevBridge } from './OIMDevBridge';

export class OIMDevBridgeStateSource implements IOIMDevStateSource {
    constructor(private readonly devBridge: OIMDevBridge, private readonly wsPort: number) {}

    public readInspect(): Promise<unknown> {
        return this.requestBrowser('inspect');
    }

    public async readDump(): Promise<string> {
        return (await this.requestBrowser('dump')) as string;
    }

    private requestBrowser(action: string): Promise<unknown> {
        if (this.devBridge.connectedBrowser === null) {
            return Promise.reject(new Error(
                `No browser tab connected to the OIMDB bridge.\n\n`
                + `Live mode — add to your debug entry point:\n`
                + `  import { OIM_DEV_REGISTRY } from '@oimdb/devtools';\n`
                + `  OIM_DEV_REGISTRY.connect(); // connects to ws://localhost:${this.wsPort}\n`
                + `Then reload the page.\n\n`
                + `Offline mode — point at a model module instead (it exports an "OIM_DEV_REGISTRY" with inspect()/dumpString()):\n`
                + `  oimdb inspect --model ./path/to/model.js\n`
                + `  OIMDB_MODEL_MODULE=./path/to/model.js npx @oimdb/mcp`,
            ));
        }
        return this.devBridge.request(action);
    }
}
