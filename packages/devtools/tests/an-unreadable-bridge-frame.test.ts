/**
 * The BROWSER half of the trust boundary the server half already holds.
 *
 * `OIMDevRegistry.connect` opened a socket to a localhost port and then believed
 * whatever came back: `JSON.parse(event.data as string)` with no `try`, and the
 * result cast straight to a request. One frame of `hello` threw a `SyntaxError`
 * out of a DOM event listener; one frame of `null` parsed and threw a
 * `TypeError` on `.type` one statement later — which is why the `null` case
 * below is the one worth keeping, exactly as it is in
 * `packages/mcp/tests/a-non-bridge-frame-answers-null-instead-of-throwing.test.ts`.
 *
 * A throw here reaches `window.onerror` rather than ending a process, which is
 * the whole severity difference — but in an application with a dev-server error
 * overlay it paints a full-screen error over a running app because something on
 * a localhost port sent bytes.
 */
// The reader is internal to the package, so it is reached where it lives — the
// same import `packages/mcp/tests/a-non-bridge-frame-answers-null-instead-of-throwing.test.ts` uses for
// the server half.
import { OIMDevBridgeRequestReader } from '../src/core/OIMDevBridgeRequestReader';
import { OIMDevRegistry } from '../src';

type TFrameListener = (event: { data: unknown }) => void;

/**
 * Enough of a `WebSocket` to hand `connect` its listeners back. Nothing here
 * connects to anything: what is under test is what the page does with a frame,
 * and a frame is a value.
 */
class FakeSocket {
    public static latest: FakeSocket | undefined = undefined;
    public readonly sent: string[] = [];
    public closed = false;
    private readonly listeners = new Map<string, TFrameListener[]>();

    constructor(_url: string) {
        FakeSocket.latest = this;
    }

    public addEventListener(type: string, listener: TFrameListener): void {
        const forType = this.listeners.get(type) ?? [];
        forType.push(listener);
        this.listeners.set(type, forType);
    }

    public send(frame: string): void {
        this.sent.push(frame);
    }

    public close(): void {
        this.closed = true;
    }

    /** Deliver one frame, as the socket would. */
    public deliver(data: unknown): void {
        for (const listener of this.listeners.get('message') ?? []) listener({ data });
    }
}

const globals = globalThis as unknown as { WebSocket?: unknown };
let originalWebSocket: unknown;

beforeEach(() => {
    originalWebSocket = globals.WebSocket;
    globals.WebSocket = FakeSocket;
    FakeSocket.latest = undefined;
});

afterEach(() => {
    globals.WebSocket = originalWebSocket;
});

/** A connected registry and the socket it opened. */
function connectRegistry(): { registry: OIMDevRegistry; socket: FakeSocket; stop: () => void } {
    const registry = new OIMDevRegistry();
    const stop = registry.connect();
    const socket = FakeSocket.latest;
    if (socket === undefined) throw new Error('connect() did not construct a socket');
    return { registry, socket, stop };
}

describe('a frame the page cannot read', () => {
    test('is dropped instead of throwing out of the message listener', () => {
        const { socket, stop } = connectRegistry();

        const frames: unknown[] = [
            // None of these may throw out of the listener:
            'hello',                    // JSON.parse threw here
            '',                         // and here
            '{',                        // and here
            'null',                     // parsed, then `.type` threw here
            '123',                      // parsed, then `.type` threw here
            '"a string"',               // parsed, then `.type` threw here
            new Uint8Array([1, 2, 3]),  // a binary frame is not a string at all,
                                        // and `as string` said it was
        ];
        for (const frame of frames) {
            expect(() => socket.deliver(frame)).not.toThrow();
        }

        // Nothing is answered and the socket stays open: an unreadable frame
        // carries no `id`, and the requester matches answers by `id` alone.
        expect(socket.sent).toEqual([]);
        expect(socket.closed).toBe(false);

        stop();
        expect(socket.closed).toBe(true);
    });

    test('a request missing its id is not answered', () => {
        const { socket, stop } = connectRegistry();

        socket.deliver('{"type":"request","action":"inspect"}');
        socket.deliver('{"type":"request","id":7,"action":"inspect"}');
        expect(socket.sent).toEqual([]);

        stop();
    });

    test('an action this page does not serve is not answered as an inspect', () => {
        const { socket, stop } = connectRegistry();

        // An unknown action gets no reading; the requester's own timeout is the reply.
        socket.deliver('{"type":"request","id":"a1","action":"history"}');
        expect(socket.sent).toEqual([]);

        stop();
    });

    test('a frame of some other type is ignored, as it always was', () => {
        const { socket, stop } = connectRegistry();

        socket.deliver('{"type":"response","id":"a1","data":null}');
        expect(socket.sent).toEqual([]);

        stop();
    });
});

describe('a frame the page can read', () => {
    test('is answered, under the id it came with', () => {
        const { socket, stop } = connectRegistry();

        socket.deliver('{"type":"request","id":"a1","action":"dump"}');
        socket.deliver('{"type":"request","id":"a2","action":"inspect"}');

        expect(socket.sent).toHaveLength(2);
        const dump = JSON.parse(socket.sent[0]) as { type: string; id: string; data: string };
        expect(dump.type).toBe('response');
        expect(dump.id).toBe('a1');
        expect(dump.data).toContain('[OIMDB DevRegistry]');

        const inspect = JSON.parse(socket.sent[1]) as {
            type: string;
            id: string;
            data: { collections: unknown; computeds: unknown };
        };
        expect(inspect.id).toBe('a2');
        expect(inspect.data.collections).toEqual({});
        expect(inspect.data.computeds).toEqual({});

        stop();
    });
});

describe('OIMDevBridgeRequestReader', () => {
    const reader = new OIMDevBridgeRequestReader();

    test('answers null for anything that is not a request this page serves', () => {
        const frames: unknown[] = [
            'hello',
            '',
            '{',
            'null',
            '123',
            '"a string"',
            '[]',
            '{"type":"nope"}',
            '{"type":"request"}',
            '{"type":"request","id":"a1"}',
            '{"type":"request","id":7,"action":"dump"}',
            '{"type":"request","id":"a1","action":"history"}',
            '{"type":"request","id":"a1","action":null}',
            undefined,
            null,
            42,
            new Uint8Array([1]),
        ];
        for (const frame of frames) {
            expect({ frame, request: reader.read(frame) }).toEqual({ frame, request: null });
        }
    });

    test('reads the two requests the bridge sends, and carries nothing else through', () => {
        expect(reader.read('{"type":"request","id":"a1","action":"dump"}'))
            .toEqual({ type: 'request', id: 'a1', action: 'dump' });
        // The extra property is dropped rather than passed on: what comes back
        // is built here, not the parsed frame with a type asserted onto it.
        expect(reader.read('{"type":"request","id":"a2","action":"inspect","extra":1}'))
            .toEqual({ type: 'request', id: 'a2', action: 'inspect' });
    });
});
