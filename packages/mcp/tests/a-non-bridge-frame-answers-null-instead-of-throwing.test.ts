/**
 * One frame of `hello` — no quotes — must not end the process: `JSON.parse`
 * would throw out of a `ws` message handler and nothing in the package
 * installs an `uncaughtException` handler.
 *
 * The `null` case is the one worth keeping: it parses, and then throws on
 * `.type` at the next line. A `try` around the parse alone would have moved the
 * crash by one statement.
 */
import { OIMDevBridgeMessageReader } from '../src/core/OIMDevBridgeMessageReader';

describe('OIMDevBridgeMessageReader', () => {
    const reader = new OIMDevBridgeMessageReader();

    it('answers null instead of throwing on anything that is not a bridge message', () => {
        const frames = [
            'hello',
            '',
            '{',
            'null',
            '123',
            '"a string"',
            '[]',
            '{"type":"nope"}',
            '{"type":"hello"}',
            '{"type":"hello","url":1,"title":"t","timestamp":0}',
            '{"type":"response"}',
            '{"type":"response","id":7}',
        ];
        for (const frame of frames) {
            expect({ frame, message: reader.read(frame) }).toEqual({ frame, message: null });
        }
    });

    it('reads a hello', () => {
        expect(reader.read('{"type":"hello","url":"http://localhost:5173/","title":"App","timestamp":1}'))
            .toEqual({ type: 'hello', url: 'http://localhost:5173/', title: 'App', timestamp: 1 });
    });

    it('reads a response, with and without an error', () => {
        expect(reader.read('{"type":"response","id":"a1","data":{"x":1}}'))
            .toEqual({ type: 'response', id: 'a1', data: { x: 1 } });
        expect(reader.read('{"type":"response","id":"a2","data":null,"error":"boom"}'))
            .toEqual({ type: 'response', id: 'a2', data: null, error: 'boom' });
    });
});
