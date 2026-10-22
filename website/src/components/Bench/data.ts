import results from '@site/src/data/bench/results.json';
import audit from '@site/src/data/bench/audit.json';
import prices from '@site/src/data/bench/prices.json';

export type BenchRow = {
  adapter: string;
  place: number | null;
  ms: number;
  ratio: number | null;
  drift: number;
  processes: number;
  samples: number;
  repeat: number;
  runs: number;
  batchSeconds: number;
  deliveries: number[];
  distinct: number[];
  redundant: number[];
  measuredAt: string;
  stale: string[];
  issues: string[];
  foreignLoad: number;
};

export type BenchTable = {
  point: string;
  scenario: string;
  rows: BenchRow[];
  problems: {adapter: string; text: string}[];
  declined: {adapter: string; reason: string}[];
  missing: string[];
};

export type BenchParticipant = {
  name: string;
  version: string;
  docs: string;
  admission: string;
  departure: string;
};

export type BenchScenario = {
  key: string;
  label: string;
  description: string;
  wiring: string;
  shape: string;
  floor: boolean;
};

export type BenchMemoryRow = {
  point: string;
  adapter: string;
  held: number | null;
  failure: string | null;
  measuredAt: string;
  fresh: boolean;
};

export type BenchResults = {
  format: number;
  memory: BenchMemoryRow[];
  codeLines: Record<string, Record<string, number>>;
  generatedAt: string;
  environment: {node: string; machine: string; host: string};
  points: {key: string; n: number; window: number; processes: number}[];
  participants: BenchParticipant[];
  excluded: {name: string; version: string; reason: string}[];
  scenarios: BenchScenario[];
  tables: BenchTable[];
};

export type AuditCard = {
  kind: 'participant' | 'scenario';
  verdict: string;
  summary: string;
  auditedAt: string;
  auditedBy: string;
  body: string;
  file: string;
  participant?: string;
  version?: string;
  wirings?: Record<string, {verdict: string; note: string}>;
  improvements?: string[];
  scenario?: string;
  models?: string;
  measures?: string;
  favours?: string[];
  biases?: string[];
};

export type AuditEntry = {
  subject: string;
  kind: 'participant' | 'scenario';
  state: 'current' | 'stale' | 'unstamped' | 'missing';
  card: AuditCard | null;
};

export type BenchPricePair = {
  id: string;
  catalogue: 'price' | 'alternative';
  path: string;
  ours: string;
  floor: string;
  caveat: string;
  oursNs: number;
  floorNs: number;
  ratio: number;
  noise: number;
  oursSpread: number;
  floorSpread: number;
  samples: number;
  measuredAt: string;
  runDir: string;
  machine: {cpu: string; node: string};
  coreFingerprint: string | null;
  isStale: boolean;
  whyAnchor: string | null;
};

export type BenchPrices = {
  generatedAt: string | null;
  coreFingerprint: string | null;
  pairs: BenchPricePair[];
  controls: BenchPricePair[];
};

export const benchPrices = prices as unknown as BenchPrices;

export const pricePairOf = (id: string): BenchPricePair | undefined =>
  benchPrices.pairs.find(pair => pair.id === id) ?? benchPrices.controls.find(pair => pair.id === id);

export const pricePairsOnPath = (path: string): BenchPricePair[] =>
  benchPrices.pairs.filter(pair => pair.catalogue === 'price' && pair.path === path);

export const alternativePairsOnPath = (path: string): BenchPricePair[] =>
  benchPrices.pairs.filter(pair => pair.catalogue === 'alternative' && pair.path === path);

export const formatNs =(ns: number): string => formatMs(ns / 1e6);

export const benchResults = results as unknown as BenchResults;
export const auditEntries = (audit as unknown as {entries: AuditEntry[]}).entries;

export const auditOf = (kind: AuditEntry['kind'], subject: string): AuditEntry | undefined =>
  auditEntries.find(entry => entry.kind === kind && entry.subject === subject);

export const tableOf = (point: string, scenario: string): BenchTable | undefined =>
  benchResults.tables.find(table => table.point === point && table.scenario === scenario);

export const measuredPointKeys = benchResults.points
  .map(point => point.key)
  .filter(key => benchResults.tables.some(table => table.point === key));

export const formatMs = (ms: number): string => {
  if (ms < 0.001) return `${(ms * 1e6).toFixed(0)} ns`;
  if (ms < 1) return `${(ms * 1000).toFixed(2)} µs`;
  return `${ms.toFixed(3)} ms`;
};

export const formatRatio = (ratio: number): string =>
  `${ratio >= 10 ? ratio.toFixed(0) : ratio >= 0.1 ? ratio.toFixed(2) : ratio.toPrecision(2)}×`;

export const codeLinesOf = (participant: string, scenario: BenchScenario): number | undefined =>
  benchResults.codeLines?.[participant]?.[scenario.shape];

const SHIPS_ITS_OWN_COLLECTIONS = new Set(['tanstack-db', 'tanstack-db-eager', 'tanstack-db-indexed', 'signaldb', 'lokijs', 'tinybase']);

export const runsOurHandWrittenStore = (participant: string): boolean =>
  !participant.startsWith('baseline') && !participant.startsWith('oimdb') && !SHIPS_ITS_OWN_COLLECTIONS.has(participant);

export const HAND_WRITTEN_STORE_NOTE = '+ hand-written collections';

export const isClean =(row: BenchRow): boolean => row.stale.length === 0 && row.issues.length === 0;

export const GITHUB = 'https://github.com/abaikov/oimdb/blob/master/packages/bench';
