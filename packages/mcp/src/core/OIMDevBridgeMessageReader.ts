import { z } from 'zod';
import type { TOIMDevBridgeMessage } from '../types/TOIMDevBridgeMessage';

// THE SOCKET IS A TRUST BOUNDARY, and parsing and validating are ONE step: a
// frame that parses is still not a message.
export class OIMDevBridgeMessageReader {
    private static readonly SCHEMA = z.discriminatedUnion('type', [
        z.object({
            type: z.literal('hello'),
            url: z.string(),
            title: z.string(),
            timestamp: z.number(),
        }),
        z.object({
            type: z.literal('response'),
            id: z.string(),
            data: z.unknown(),
            error: z.string().optional(),
        }),
    ]);

    public read(raw: string): TOIMDevBridgeMessage | null {
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw) as unknown;
        } catch {
            return null;
        }
        const result = OIMDevBridgeMessageReader.SCHEMA.safeParse(parsed);
        if (!result.success) return null;
        // Only reconciles optional-vs-required `data`; every field is checked.
        return result.data as TOIMDevBridgeMessage;
    }
}
