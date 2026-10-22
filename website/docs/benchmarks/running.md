---
sidebar_position: 6
title: Running the suite
description: How to run the benchmark matrix a budget at a time, narrow a run, leave it unattended, find the stored numbers and keep the audit current.
---

# Running the suite

The whole matrix takes many hours on an idle machine. It is never run at once. It is
collected **a budget at a time**, and every run measures only what is due.

```bash
cd packages/bench

npm run bench -- status                     # the matrix: fresh, stale, missing, declined; time still due
npm run bench -- next --budget 20m          # measure the due cells that fit in 20 minutes, then publish
npm run bench -- next --budget 2h --wait    # wait for an idle machine instead of stopping
npm run bench -- next --dry-run             # print the batches it would run
npm run bench -- report --scenario patchColumn
```

`next` picks cells in order (missing and stale first, the `default` point before
`wide` and `small`, scenarios in report order), packs as many as the budget allows
into batches, and estimates each from the batch that last measured it (or from the
scenario's probes). It always runs at least one batch. An interrupted run loses only
the batch in flight: every finished batch is already stored.

## Narrowing

Every command takes the same filters:

```bash
npm run bench -- next --point default --scenario patchColumn,patchNote
npm run bench -- run  --adapter oimdb --point small        # re-measure, due or not
npm run bench -- next --retry                              # also re-measure failed and flagged cells
npm run bench -- verify --adapter mobx                     # correctness only, nothing timed or stored
npm run bench -- plan --scenario resortWindow              # forget a sampling plan; the next batch re-calibrates
npm run bench -- memory                                    # heap held per participant, stale or missing ones
npm run bench -- list                                      # points, scenarios, participants
```

## How much to measure

Three knobs decide how much a run costs, and they combine:

| knob | what it cuts | what the cell says afterwards |
|---|---|---|
| `--budget 20m` | how many batches run; the rest stay due for the next run | nothing — an unmeasured cell is simply still due |
| `--point`, `--scenario`, `--adapter` | which cells are considered at all | nothing |
| `--processes 1` | processes per cell below the point's own (`default` 3, `wide` and `small` 2) | flagged `shallow`: shown with its number, never counted as finished, and `next --retry` measures it again at full depth |

```bash
npm run bench -- next --point small --processes 1 --budget 15m   # a quick first look at everything
npm run bench -- next --retry --budget 2h                        # later: deepen the shallow cells
```

Every measured cell records how many timed runs stand behind its number
(processes × samples per process × runs per sample) and the batch's wall time. The
report prints it as `3p×12s×40r=1440`, and the tables on this site carry it in the
**timed runs** column (hover for the breakdown). A batch logs the same count before it
starts timing.

## Leaving it to run

The measurement window is exclusive: no test suite, no type-check, no build, no
indexing editor, no other benchmark. `--wait` checks the load gate before every batch
and sleeps until the machine is quiet, so an overnight run is:

```bash
npm run bench:night --workspace @oimdb/bench     # caffeinate -i … next --budget 6h --wait
```

To have it start by itself every night at 01:00 on macOS, save this as
`~/Library/LaunchAgents/org.oimdb.bench.plist` (adjust the two paths) and load it with
`launchctl load ~/Library/LaunchAgents/org.oimdb.bench.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>org.oimdb.bench</string>
  <key>WorkingDirectory</key><string>/path/to/oimdb/packages/bench</string>
  <key>ProgramArguments</key>
  <array><string>/bin/zsh</string><string>-lc</string><string>npm run bench:night</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>1</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>/path/to/oimdb/packages/bench/results/night.log</string>
  <key>StandardErrorPath</key><string>/path/to/oimdb/packages/bench/results/night.log</string>
</dict>
</plist>
```

`launchctl unload` the same file stops it. Every night picks up where the last one
stopped, because only due cells are measured.

## Where the numbers go

| path | what |
|---|---|
| `packages/bench/results/cells/<point>--<scenario>.json` | the latest record of every cell: fingerprint, plan, batch, load, outcome |
| `packages/bench/results/plans/` | the stored sampling plans |
| `packages/bench/results/memory/<point>.json` | the heap each participant held, with the fingerprint it was weighed at |
| `packages/bench/results/batches.jsonl` | one line per batch ever run, for timing estimates and history |
| `website/src/data/bench/results.json` | what this site renders — written by `next` and by `npm run bench -- publish` |
| `website/src/data/bench/audit.json` | the audit cards — written by `npm run audit -- publish` |

All of it is committed: a run writes the files, and the commit after it carries the cells
and the page together. Nothing commits by itself. A checkout on another machine sees
every cell as stale with reason `environment` until it is measured there; only
`results/night.log` is ignored.

## Keeping the audit current

```bash
npm run audit -- status            # current / stale / unstamped / missing, per participant and scenario
npm run audit -- stamp mobx        # after re-reading audit/participants/mobx.md against the adapter
npm run audit -- publish
```

Changing an adapter makes its card stale; changing a scenario's script makes that
scenario's card stale. The card format is in
[`packages/bench/audit/README.md`](https://github.com/abaikov/oimdb/blob/master/packages/bench/audit/README.md).
