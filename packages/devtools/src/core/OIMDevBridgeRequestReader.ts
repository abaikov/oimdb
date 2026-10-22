import type { TOIMDevBridgeRequest } from '../types/TOIMDevBridgeRequest';

export class OIMDevBridgeRequestReader {
    /** The request this frame carries, or `null` when it is not one. */
    public read(raw: unknown): TOIMDevBridgeRequest | null {
        if (typeof raw !== 'string') return null;

        let parsed: unknown;
        try {
            parsed = JSON.parse(raw) as unknown;
        } catch {
            return null;
        }

        // `null` is an object to `typeof`, which is why both halves are written.
        if (parsed === null || typeof parsed !== 'object') return null;

        const fields = parsed as Record<string, unknown>;
        if (fields.type !== 'request') return null;
        // The requester matches answers by `id` alone, so a non-string is unanswerable.
        if (typeof fields.id !== 'string') return null;
        if (fields.action !== 'dump' && fields.action !== 'inspect') return null;

        return { type: 'request', id: fields.id, action: fields.action };
    }
}
