import type { WebSocket } from 'ws';

export type TOIMDevConnectedBrowser = {
    ws: WebSocket;
    url: string;
    title: string;
};
