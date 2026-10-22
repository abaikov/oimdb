export type TOIMDevBridgeRequest = {
    type: 'request';
    id: string;
    action: 'dump' | 'inspect';
};
