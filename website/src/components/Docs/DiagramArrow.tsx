import type {ReactNode} from 'react';
import styles from './styles.module.css';

export default function DiagramArrow(): ReactNode {
  return <span className={styles.arrow}>→</span>;
}
