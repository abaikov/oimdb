import { exoSource } from '../src/exoSource';

/**
 * An upstream that keeps one entry PER SUBSCRIBE CALL, the way every real source does — an OIMDB
 * channel, a DOM target, an event emitter. A fake that stored handlers in a `Set` would collapse
 * the two calls itself and hide the very thing under test.
 */
function makeUpstream(): {
    subscribe(onChange: () => void): () => void;
    emit(): void;
    readonly subscribeCalls: number;
    readonly liveCount: number;
} {
    const entries: Array<{ onChange: () => void; live: boolean }> = [];
    let subscribeCalls = 0;
    return {
        subscribe(onChange: () => void): () => void {
            subscribeCalls++;
            const entry = { onChange, live: true };
            entries.push(entry);
            return () => {
                if (!entry.live) return;
                entry.live = false;
                const at = entries.indexOf(entry);
                if (at >= 0) entries.splice(at, 1);
            };
        },
        emit(): void {
            for (const entry of entries.slice()) if (entry.live) entry.onChange();
        },
        get subscribeCalls(): number { return subscribeCalls; },
        get liveCount(): number { return entries.length; },
    };
}

describe('exoSource', () => {
    /**
     * The defect: subscribers were a `Set` of handlers, so the same function subscribed twice left
     * the set at size 1 — the second call therefore took the "first subscriber" branch, subscribed
     * upstream AGAIN, and overwrote the disposer of the first subscription, which was then never
     * released. Against an OIMDB source that stranded entry is a reference the identity behind it
     * is never reclaimed from.
     */
    it('keeps one entry per SUBSCRIBE CALL, so the same handler may subscribe twice', () => {
        const upstream = makeUpstream();
        let value = 0;
        const source = exoSource(() => value, upstream.subscribe);

        let calls = 0;
        const handler = (): void => { calls++; };
        const off1 = source.subscribe(handler);
        const off2 = source.subscribe(handler);

        // One upstream subscription however many downstream ones share a function.
        expect(upstream.subscribeCalls).toBe(1);
        expect(upstream.liveCount).toBe(1);

        value = 1;
        upstream.emit();
        // Two subscriptions, so two calls — of the one handler.
        expect(calls).toBe(2);

        off1();
        // The other subscription is untouched by the first one's disposer.
        expect(upstream.liveCount).toBe(1);
        upstream.emit();
        expect(calls).toBe(3);

        off2();
        // And the last one leaving releases upstream — nothing stranded.
        expect(upstream.liveCount).toBe(0);
        upstream.emit();
        expect(calls).toBe(3);
    });

    it('disposing the same subscription twice takes nobody else with it', () => {
        const upstream = makeUpstream();
        const source = exoSource(() => 0, upstream.subscribe);

        let first = 0, second = 0;
        const off1 = source.subscribe(() => { first++; });
        source.subscribe(() => { second++; });

        off1();
        off1();

        upstream.emit();
        expect(first).toBe(0);
        expect(second).toBe(1);
        expect(upstream.liveCount).toBe(1);
    });

    it('a subscriber disposed from inside a notification is not called in that round', () => {
        const upstream = makeUpstream();
        const source = exoSource(() => 0, upstream.subscribe);

        let first = 0, second = 0;
        const off2: { current: (() => void) | undefined } = { current: undefined };
        source.subscribe(() => { first++; off2.current?.(); });
        off2.current = source.subscribe(() => { second++; });

        upstream.emit();
        expect(first).toBe(1);
        expect(second).toBe(0);
    });

    /**
     * The defect: `priming = true` was cleared on the line AFTER the upstream subscribe, with
     * nothing containing a throw. The flag then stayed true for ever, and `onUpstreamChange` opens
     * with `if (priming) return` — so every later change was dropped in silence. The entry pushed
     * before the call compounded it: a throwing subscribe returns no disposer, so nobody could
     * remove that entry, and with the list never back at zero the "first subscriber" branch never
     * re-armed upstream.
     */
    it('a subscribe that throws leaves nothing behind, so the next subscriber is the first again', () => {
        const upstream = makeUpstream();
        let refuse = true;
        const source = exoSource(() => 0, onChange => {
            if (refuse) throw new Error('upstream refused');
            return upstream.subscribe(onChange);
        });

        let calls = 0;
        const handler = (): void => { calls++; };

        expect(() => source.subscribe(handler)).toThrow('upstream refused');
        expect(upstream.subscribeCalls).toBe(0);

        refuse = false;
        source.subscribe(handler);
        expect(upstream.subscribeCalls).toBe(1);
        expect(upstream.liveCount).toBe(1);

        upstream.emit();
        // The refused call left no entry, so exactly one handler is woken.
        expect(calls).toBe(1);
    });

    /**
     * The other half of the same throw, and the one that pins `priming` on its own: an upstream
     * that REGISTERED before it threw. Its registration is still live and still points at
     * `onUpstreamChange`, so a later emit does arrive here, and the flag must be cleared.
     */
    it('an upstream that registered before it threw does not leave this bindable deaf', () => {
        const upstream = makeUpstream();
        let refuse = true;
        const source = exoSource(() => 0, onChange => {
            const off = upstream.subscribe(onChange);
            if (refuse) throw new Error('upstream refused after registering');
            return off;
        });

        let calls = 0;
        const handler = (): void => { calls++; };
        expect(() => source.subscribe(handler)).toThrow('upstream refused after registering');

        refuse = false;
        source.subscribe(handler);

        upstream.emit();
        // TWO, and the second one is the refused attempt's registration: it threw its own disposer
        // away, so nothing here was ever handed a way to undo it — that leak is the upstream's, and
        // it is not what this asserts. What this asserts is that the emit ARRIVES at all.
        expect(calls).toBe(2);
    });

    it('subscribes upstream only while somebody is listening', () => {
        const upstream = makeUpstream();
        const source = exoSource(() => 0, upstream.subscribe);
        let runCount = 0;

        expect(upstream.subscribeCalls).toBe(0);
        const off = source.subscribe(() => { runCount++; });
        expect(upstream.subscribeCalls).toBe(1);
        off();
        expect(upstream.liveCount).toBe(0);

        source.subscribe(() => { runCount++; });
        expect(upstream.subscribeCalls).toBe(2);
        expect(upstream.liveCount).toBe(1);
        upstream.emit();
        expect(runCount).toBe(1);
    });
});
