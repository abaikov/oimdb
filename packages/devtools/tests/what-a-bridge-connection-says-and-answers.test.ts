import { OIMDB, createOIMEntityService } from '@oimdb/core';
import { OIMDevRegistry } from '../src';

type TSocketListener = (event: { data?: unknown }) => void;

class FakeSocket {
    public static latest: FakeSocket | undefined = undefined;
    public readonly sent: string[] = [];
    private readonly listeners = new Map<string, TSocketListener[]>();

    public constructor(public readonly url: string) {
        FakeSocket.latest = this;
    }

    public addEventListener(type: string, listener: TSocketListener): void {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }

    public send(frame: string): void {
        this.sent.push(frame);
    }

    public close(): void {
        return;
    }

    public fire(type: string, data?: unknown): void {
        for (const listener of this.listeners.get(type) ?? []) listener({ data });
    }
}

type TPageGlobals = { WebSocket?: unknown; window?: unknown; document?: unknown };

const pageGlobals = globalThis as unknown as TPageGlobals;
let savedGlobals: TPageGlobals;

beforeEach(() => {
    savedGlobals = { WebSocket: pageGlobals.WebSocket, window: pageGlobals.window, document: pageGlobals.document };
    pageGlobals.WebSocket = FakeSocket;
    FakeSocket.latest = undefined;
});

afterEach(() => {
    pageGlobals.WebSocket = savedGlobals.WebSocket;
    pageGlobals.window = savedGlobals.window;
    pageGlobals.document = savedGlobals.document;
    jest.restoreAllMocks();
});

const openedSocket = (): FakeSocket => {
    const socket = FakeSocket.latest;
    if (socket === undefined) throw new Error('connect() opened no socket');
    return socket;
};

describe('what a bridge connection says and answers', () => {
    test('refuses to connect where there is no WebSocket', () => {
        pageGlobals.WebSocket = undefined;

        expect(() => new OIMDevRegistry().connect()).toThrow('connect() requires a browser environment');
    });

    test('introduces itself with unknown page details where there is no window or document', () => {
        pageGlobals.window = undefined;
        pageGlobals.document = undefined;
        const stop = new OIMDevRegistry().connect('ws://localhost:9000');
        const socket = openedSocket();

        socket.fire('open');

        expect(socket.url).toBe('ws://localhost:9000');
        const hello = JSON.parse(socket.sent[0]) as { type: string; url: string; title: string; timestamp: number };
        expect(hello).toMatchObject({ type: 'hello', url: 'unknown', title: 'unknown' });
        expect(typeof hello.timestamp).toBe('number');
        stop();
    });

    test('introduces itself with the page address and title inside a page', () => {
        pageGlobals.window = { location: { href: 'http://localhost:5173/board' } };
        pageGlobals.document = { title: 'Board' };
        const stop = new OIMDevRegistry().connect();
        const socket = openedSocket();

        socket.fire('open');

        expect(JSON.parse(socket.sent[0])).toMatchObject({ type: 'hello', url: 'http://localhost:5173/board', title: 'Board' });
        stop();
    });

    test('answers a request it failed to read the registry for with the error and no data', () => {
        const db = new OIMDB();
        const usersService = createOIMEntityService<{ id: string }>(db, { keyOf: user => user.id });
        const users = usersService.createStoreSlot(db);
        const registry = new OIMDevRegistry();
        registry.collection('users', { getSlots: () => { throw new Error('the store is unreadable'); } }, users);
        const stop = registry.connect();
        const socket = openedSocket();

        socket.fire('message', '{"type":"request","id":"r1","action":"inspect"}');

        expect(JSON.parse(socket.sent[0])).toEqual({
            type: 'response', id: 'r1', data: null, error: 'Error: the store is unreadable',
        });
        stop();
    });

    test('warns, naming the address, when the bridge cannot be reached', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        const stop = new OIMDevRegistry().connect('ws://localhost:7999');

        openedSocket().fire('error');

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('ws://localhost:7999');
        stop();
    });
});
