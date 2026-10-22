import type {ReactNode} from 'react';
import {pricePairsOnPath} from './data';
import BenchPriceRows from './BenchPriceRows';

export default function BenchPriceTable({path}: {path: string}): ReactNode {
  return <BenchPriceRows pairs={pricePairsOnPath(path)} empty="No price is published on this path yet." />;
}
