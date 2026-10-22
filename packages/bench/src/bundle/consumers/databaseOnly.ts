/**
 * THE FLOOR NOBODY CAN AVOID: a database and nothing else.
 *
 * `OIMDB` is imported by every consumer of this package, and a class's
 * methods cannot be dropped one at a time, so whatever this file costs is the
 * toll on the whole library. `packages/core/tests/what-an-import-retains.test.ts`
 * names that closure (`the database retains only the frame, the graph and the
 * subscribers`); this is the same fact in bytes.
 *
 * It also serves the tree-shaking control: if a bundler were not dropping dead
 * code this arm would come out the size of `everything.ts`, and the report would
 * then be measuring through an instrument that cannot tell reachable code from
 * unreachable.
 */
import { OIMDB } from '../../../../core/src/index';

/**
 * Exported because an entry point's exports are the one thing tree-shaking may
 * never remove.
 */
export const started: readonly unknown[] = [new OIMDB()];
