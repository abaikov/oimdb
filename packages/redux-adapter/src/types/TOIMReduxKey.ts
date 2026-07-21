import { TOIMKey, TOIMPk } from '@oimdb/core';

/**
 * The Redux state object key for an OIMDB key/PK. Redux state objects key by
 * string at runtime, so a primitive PK is used as-is (`Record<TPk, …>`,
 * unchanged for existing users) while a composite key path — which cannot be an
 * object key — is projected to a string by an `IOIMPkCodec` (`entities` become
 * `Record<string, …>`).
 */
export type TOIMReduxKey<T extends TOIMKey> = T extends TOIMPk ? T : string;
