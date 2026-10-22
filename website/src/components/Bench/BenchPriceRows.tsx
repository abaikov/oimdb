import type {ReactNode} from 'react';
import clsx from 'clsx';
import {GITHUB, benchPrices, formatNs, formatRatio, type BenchPricePair} from './data';
import styles from './styles.module.css';

const SIDE_LABELS: Record<BenchPricePair['catalogue'], {ours: string; floor: string}> = {
  price: {ours: 'Ours', floor: 'Floor'},
  alternative: {ours: 'Shipped', floor: 'Alternative'},
};

function PriceCard({pair}: {pair: BenchPricePair}): ReactNode {
  const sideLabels = SIDE_LABELS[pair.catalogue];
  return (
    <article className={clsx(styles.priceCard, pair.isStale && styles.priceCardStale)} id={pair.id}>
      <div className={styles.priceSides}>
        <div>
          <span className={styles.priceSideLabel}>{sideLabels.ours}</span>
          <code>{pair.ours}</code>
        </div>
        <div>
          <span className={styles.priceSideLabel}>{sideLabels.floor}</span>
          <code>{pair.floor}</code>
        </div>
      </div>
      <div className={styles.priceFigures}>
        <span>
          <strong>{formatNs(pair.oursNs)}</strong> {sideLabels.ours.toLowerCase()}
        </span>
        <span>
          <strong>{formatNs(pair.floorNs)}</strong> {sideLabels.floor.toLowerCase()}
        </span>
        <span className={styles.priceRatio}>{formatRatio(pair.ratio)}</span>
        <span className={styles.priceNoise}>
          {sideLabels.floor.toLowerCase()} timed twice: {(pair.noise * 100).toFixed(1)}% apart
        </span>        {pair.isStale && (
          <span className={clsx(styles.auditState, styles.audit_stale)}>measured before the current core</span>
        )}
      </div>
      <details className={styles.priceCaveat}>
        <summary>What the two sides do differently</summary>
        <p>{pair.caveat}</p>
      </details>
      <div className={styles.priceMeta}>
        <a href={`${GITHUB}/${pair.runDir}`}>measured {pair.measuredAt}</a>
        {pair.whyAnchor ? (
          <a href={`${GITHUB}/${pair.whyAnchor.replace(/^packages\/bench\//, '')}`}>why</a>
        ) : (
          <span>no explanation yet</span>
        )}
        <code>{pair.id}</code>
      </div>
    </article>
  );
}

export default function BenchPriceRows({pairs, empty}: {pairs: BenchPricePair[]; empty: string}): ReactNode {
  if (pairs.length === 0) {
    return <p className={styles.description}>{empty}</p>;
  }
  return (
    <div className={styles.priceCards}>
      {pairs.map(pair => (
        <PriceCard key={pair.id} pair={pair} />
      ))}
      {benchPrices.generatedAt && <p className={styles.description}>Published {benchPrices.generatedAt}.</p>}
    </div>
  );
}
