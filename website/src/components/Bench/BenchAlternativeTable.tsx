import type {ReactNode} from 'react';
import {alternativePairsOnPath} from './data';
import BenchPriceRows from './BenchPriceRows';

export default function BenchAlternativeTable({path}: {path: string}): ReactNode {
  return <BenchPriceRows pairs={alternativePairsOnPath(path)} empty="No alternative is published on this path yet." />;
}
