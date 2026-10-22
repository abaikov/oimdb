import { readFileSync } from 'fs';
import { join } from 'path';
import type { TOIMDevUIAsset } from '../types/TOIMDevUIAsset';

// A REQUEST PATH IS A KEY INTO THIS TABLE AND NOTHING ELSE — never a path
// fragment, however checked afterwards.
export class OIMDevUIAssetCatalog {
    private static readonly ASSETS: ReadonlyMap<string, TOIMDevUIAsset> = new Map([
        ['/', { fileName: 'index.html', contentType: 'text/html; charset=utf-8' }],
        ['/index.html', { fileName: 'index.html', contentType: 'text/html; charset=utf-8' }],
        ['/app.js', { fileName: 'app.js', contentType: 'text/javascript; charset=utf-8' }],
        ['/app.css', { fileName: 'app.css', contentType: 'text/css; charset=utf-8' }],
    ]);

    private readonly uiDir: string;

    constructor(uiDir: string) {
        this.uiDir = uiDir;
    }

    public resolve(requestUrl: string): TOIMDevUIAsset | null {
        const path = requestUrl.split('?', 1)[0].split('#', 1)[0];
        return OIMDevUIAssetCatalog.ASSETS.get(path) ?? null;
    }

    // Per request, so the UI stays editable; the constant file name is what
    // makes that safe, not the timing.
    public read(asset: TOIMDevUIAsset): Buffer {
        return readFileSync(join(this.uiDir, asset.fileName));
    }
}
