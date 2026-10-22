/**
 * The request path is a key, and these are the keys.
 *
 * What this replaced handed `req.url` to `path.join` and read the result, and
 * `join` collapses `..` for you — so `GET /../../../../etc/passwd` was answered
 * with the file, to anybody who could reach the port.
 */
import { OIMDevUIAssetCatalog } from '../src/core/OIMDevUIAssetCatalog';

describe('OIMDevUIAssetCatalog', () => {
    const catalog = new OIMDevUIAssetCatalog('/opt/oimdb/ui');

    it('serves the four known request paths and nothing else', () => {
        expect(catalog.resolve('/')?.fileName).toBe('index.html');
        expect(catalog.resolve('/index.html')?.fileName).toBe('index.html');
        expect(catalog.resolve('/app.js')?.fileName).toBe('app.js');
        expect(catalog.resolve('/app.css')?.fileName).toBe('app.css');
        expect(catalog.resolve('/package.json')).toBeNull();
    });

    it('refuses every spelling of a path outside the UI directory', () => {
        const escapes = [
            '/../../../../etc/passwd',
            '/..%2f..%2fetc/passwd',
            '/%2e%2e/%2e%2e/etc/passwd',
            '//etc/passwd',
            '/./../../etc/passwd',
            '/app.js/../../../etc/passwd',
            '/index.html\0.js',
            '\\..\\..\\windows\\win.ini',
        ];
        for (const path of escapes) {
            expect({ path, asset: catalog.resolve(path) }).toEqual({ path, asset: null });
        }
    });

    it('drops the query and the hash, so a cache-busted asset resolves', () => {
        expect(catalog.resolve('/app.js?v=2')?.fileName).toBe('app.js');
        expect(catalog.resolve('/app.css?t=1#top')?.fileName).toBe('app.css');
        expect(catalog.resolve('/?x=1')?.fileName).toBe('index.html');
        // And dropping them is not a way back in.
        expect(catalog.resolve('/../etc/passwd?x=/app.js')).toBeNull();
    });

    it('gives every asset an explicit content type', () => {
        expect(catalog.resolve('/')?.contentType).toBe('text/html; charset=utf-8');
        expect(catalog.resolve('/app.js')?.contentType).toBe('text/javascript; charset=utf-8');
        expect(catalog.resolve('/app.css')?.contentType).toBe('text/css; charset=utf-8');
    });
});
