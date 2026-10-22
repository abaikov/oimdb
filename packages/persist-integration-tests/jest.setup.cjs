// jsdom does not expose a few globals these integration tests rely on:
// - structuredClone: used by fake-indexeddb to clone stored records;
// - MessageChannel/MessagePort: used by react-dom 19's scheduler during
//   renderToString / hydrateRoot.
// Polyfill them from Node built-ins so the jsdom environment matches a real
// browser closely enough for these end-to-end checks.
const { MessagePort } = require('node:worker_threads');
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
    // react-dom's scheduler and React's `act` each open a MessageChannel and
    // never close it, and this channel therefore has to own no handle at all.
    //
    // A `node:worker_threads` channel cannot: `port.onmessage = fn` calls
    // `ref()` internally, so the `unref()` this file used to do in the
    // constructor was undone the moment React installed its handler, the port
    // held the event loop open for the rest of the process, and `npm test`
    // never returned. The unref only looked sufficient while
    // IS_REACT_ACT_ENVIRONMENT was unset and `act` never enqueued a task.
    //
    // React uses exactly two properties — `port1.onmessage` and
    // `port2.postMessage` — and one `setImmediate` per message delivers them
    // with nothing left registered between messages.
    global.MessageChannel = class {
        constructor() {
            const port1 = { onmessage: null };
            this.port1 = port1;
            this.port2 = {
                postMessage(data) {
                    setImmediate(() => {
                        if (typeof port1.onmessage === 'function') {
                            port1.onmessage({ data });
                        }
                    });
                },
            };
        }
    };
}
// React 19 checks this flag before it will treat `act()` as a real act scope;
// without it every `act()` here logs "The current testing environment is not
// configured to support act(...)". The tests that mock console.error swallowed
// that message, so it only became visible once teardown moved into an
// afterEach that is not inside the mock.
global.IS_REACT_ACT_ENVIRONMENT = true;

if (typeof global.structuredClone === 'undefined') {
    global.structuredClone = value => v8.deserialize(v8.serialize(value));
}
