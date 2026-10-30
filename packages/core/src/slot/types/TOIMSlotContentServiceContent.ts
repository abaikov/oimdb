export type TOIMSlotContentServiceContent<TSlotContentService> = TSlotContentService extends {
    writeSlotContent(slot: never, content: infer TContent): boolean;
} ? TContent : never;
