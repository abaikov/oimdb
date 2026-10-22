import type { TOIMDisposer } from '@oimdb/core';

export type TOIMExoRenderedRow<TSchema> = {
    readonly schema: TSchema;
    readonly dispose: TOIMDisposer;
};
