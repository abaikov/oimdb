/**
 * Three things carry a host — the interface a server binds, a request's `Host`
 * header, a page's `Origin` — and they are one question with three spellings.
 */
import { OIMDevLoopbackPolicy } from '../src/core/OIMDevLoopbackPolicy';

describe('OIMDevLoopbackPolicy', () => {
    it('recognises the names that mean this machine', () => {
        for (const host of ['localhost', '127.0.0.1', '::1', '[::1]', 'app.localhost']) {
            expect({ host, loopback: OIMDevLoopbackPolicy.isLoopbackHost(host) })
                .toEqual({ host, loopback: true });
        }
        for (const host of ['0.0.0.0', '192.168.1.5', 'evil.com', 'localhost.evil.com']) {
            expect({ host, loopback: OIMDevLoopbackPolicy.isLoopbackHost(host) })
                .toEqual({ host, loopback: false });
        }
    });

    it('strips the port from an authority, bracketed IPv6 included', () => {
        expect(OIMDevLoopbackPolicy.isLoopbackAuthority('localhost:7433')).toBe(true);
        expect(OIMDevLoopbackPolicy.isLoopbackAuthority('127.0.0.1:7433')).toBe(true);
        expect(OIMDevLoopbackPolicy.isLoopbackAuthority('[::1]:7433')).toBe(true);
        // The DNS-rebinding case: a name the attacker controls, pointed here.
        expect(OIMDevLoopbackPolicy.isLoopbackAuthority('rebind.evil.com:7433')).toBe(false);
    });

    it('accepts a page served from this machine and refuses the rest', () => {
        expect(OIMDevLoopbackPolicy.isLoopbackOrigin('http://localhost:5173')).toBe(true);
        expect(OIMDevLoopbackPolicy.isLoopbackOrigin('http://127.0.0.1:3000')).toBe(true);
        expect(OIMDevLoopbackPolicy.isLoopbackOrigin('https://evil.com')).toBe(false);
        // A sandboxed iframe on any site in the world sends exactly this one.
        expect(OIMDevLoopbackPolicy.isLoopbackOrigin('null')).toBe(false);
        expect(OIMDevLoopbackPolicy.isLoopbackOrigin('not a url')).toBe(false);
    });
});
