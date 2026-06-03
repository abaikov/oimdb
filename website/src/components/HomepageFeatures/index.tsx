import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  emoji: string;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Performance First',
    emoji: '⚡',
    description: (
      <>
        Map-based storage with O(1) lookups, slot-backed indexes, and
        intelligent event coalescing. Built for large in-memory datasets in the
        browser.
      </>
    ),
  },
  {
    title: 'Reactive by Design',
    emoji: '📡',
    description: (
      <>
        Key-scoped subscriptions, configurable schedulers, and reentrancy-safe
        flush semantics. Only the components that watch changed keys get
        notified.
      </>
    ),
  },
  {
    title: 'Modular Ecosystem',
    emoji: '🧩',
    description: (
      <>
        Core library plus React hooks, Redux adapter, async stores, and snapshot
        utilities. Use one package or compose the full stack.
      </>
    ),
  },
];

function Feature({title, emoji, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <span className={styles.featureEmoji} role="img" aria-hidden="true">
          {emoji}
        </span>
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
