// A page anywhere can point a hostname it controls at 127.0.0.1, so binding to
// loopback is not the check.
export class OIMDevLoopbackPolicy {
    private static readonly HOSTS: ReadonlySet<string> = new Set([
        'localhost',
        '127.0.0.1',
        '::1',
        '[::1]',
    ]);

    public static isLoopbackHost(host: string): boolean {
        return OIMDevLoopbackPolicy.HOSTS.has(host) || host.endsWith('.localhost');
    }

    public static isLoopbackAuthority(authority: string): boolean {
        const host = authority.startsWith('[')
            ? authority.slice(0, authority.indexOf(']') + 1)
            : authority.split(':', 1)[0];
        return OIMDevLoopbackPolicy.isLoopbackHost(host);
    }

    // The literal string `null` is NOT loopback: a sandboxed iframe on any site
    // in the world sends exactly that.
    public static isLoopbackOrigin(origin: string): boolean {
        try {
            return OIMDevLoopbackPolicy.isLoopbackHost(new URL(origin).hostname);
        } catch {
            return false;
        }
    }
}
