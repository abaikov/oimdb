import type {ReactNode} from 'react';
import {benchPrices} from './data';
import BenchPriceRows from './BenchPriceRows';

export default function BenchPriceControls(): ReactNode {
  return <BenchPriceRows pairs={benchPrices.controls} empty="No control is published yet." />;
}
