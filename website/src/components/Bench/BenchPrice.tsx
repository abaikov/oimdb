import type {ReactNode} from 'react';
import clsx from 'clsx';
import {formatNs, formatRatio, pricePairOf} from './data';
import styles from './styles.module.css';

export default function BenchPrice({id}: {id: string}): ReactNode {
  const pair = pricePairOf(id);
  if (!pair) {
    return <span className={clsx(styles.priceInline, styles.audit_missing)}>not measured yet ({id})</span>;
  }
  return (
    <span className={styles.priceInline} title={pair.caveat}>
      {formatNs(pair.oursNs)} against a floor of {formatNs(pair.floorNs)} ({formatRatio(pair.ratio)})
      {pair.isStale && <span className={clsx(styles.auditState, styles.audit_stale)}>measured before the current core</span>}
    </span>
  );
}
