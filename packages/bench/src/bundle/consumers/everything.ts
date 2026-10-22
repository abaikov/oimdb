/**
 * THE DENOMINATOR: the whole published surface, with nothing droppable.
 *
 * Not what any application ships — the largest honest reading of "the package",
 * and deliberately the largest, because a percentage is flattered by a small
 * denominator and the claim should not be flattered by this file.
 *
 * `export *` and not a list of imports: a list would go stale the day somebody
 * adds an export, and it would go stale SILENTLY — the denominator would shrink
 * and every percentage in the artifact would grow.
 */
export * from '../../../../core/src/index';
