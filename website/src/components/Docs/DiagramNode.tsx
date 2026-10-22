import type {ReactNode} from 'react';
import clsx from 'clsx';
import styles from './styles.module.css';

export default function DiagramNode({
  title,
  note,
  tone,
  className,
}: {
  title: ReactNode;
  note: ReactNode;
  tone?: 'accent' | 'gold' | 'muted';
  className?: string;
}): ReactNode {
  return (
    <div
      className={clsx(
        styles.node,
        tone === 'accent' && styles.nodeAccent,
        tone === 'gold' && styles.nodeGold,
        tone === 'muted' && styles.nodeMuted,
        className,
      )}>
      <span className={styles.nodeTitle}>{title}</span>
      <span className={styles.nodeNote}>{note}</span>
    </div>
  );
}
