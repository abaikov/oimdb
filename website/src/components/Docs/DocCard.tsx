import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import styles from './styles.module.css';

export default function DocCard({to, title, children}: {to: string; title: string; children?: ReactNode}): ReactNode {
  return (
    <Link to={to} className={styles.card}>
      <span className={styles.cardTitle}>{title}</span>
      {children && <span className={styles.cardBody}>{children}</span>}
    </Link>
  );
}
