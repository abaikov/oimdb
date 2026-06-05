// jsdom does not expose a few globals these integration tests rely on:
// - structuredClone: used by fake-indexeddb to clone stored records;
// - MessageChannel/MessagePort: used by react-dom 19's scheduler during
//   renderToString / hydrateRoot.
// Polyfill them from Node built-ins so the jsdom environment matches a real
// browser closely enough for these end-to-end checks.
const { MessageChannel, MessagePort } = require('node:worker_threads');
const { TextEncoder, TextDecoder } = require('node:util');
const v8 = require('node:v8');

if (typeof global.TextEncoder === 'undefined') {
    global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
    global.TextDecoder = TextDecoder;
}
if (typeof global.MessagePort === 'undefined') {
    global.MessagePort = MessagePort;
}
if (typeof global.MessageChannel === 'undefined') {
    // react-dom's scheduler opens a MessageChannel and never closes it. Node's
    // worker_threads ports keep the event loop alive, which makes Jest warn
    // about a worker that failed to exit. unref() the ports so the process can
    // exit cleanly once the tests finish.
    global.MessageChannel = class extends MessageChannel {
        constructor() {
            super();
            this.port1.unref?.();
            this.port2.unref?.();
        }
    };
}
if (typeof global.structuredClone === 'undefined') {
    global.structuredClone = value => v8.deserialize(v8.serialize(value));
}
