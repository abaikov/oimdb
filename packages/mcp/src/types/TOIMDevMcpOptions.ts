export type TOIMDevMcpOptions = {
    /** Port for the WebSocket bridge that browser tabs connect to. Default: 7432 */
    wsPort?: number;
};

export type TOIMBridgeHello = {
    type: 'hello';
    url: string;
    title: string;
    timestamp: number;
};

export type TOIMBridgeResponse = {
    type: 'response';
    id: string;
    data: unknown;
    error?: string;
};

export type TOIMBridgeMessage = TOIMBridgeHello | TOIMBridgeResponse;
