---
scenario: "relationFloor"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "71d21923fb2a38e5"
verdict: "synthetic"
models: "Nothing an application does: the two relation scripts with the store removed, delivering 8-line views straight from arrays of strings."
measures: "The cost every relation participant pays alike: writing a name or mark into a prepared text array and one `deliverRelation` of 8 lines per step, 16 steps."
favours:
  - "Nothing by construction: no participant runs in this table. It divides relationWrite and compositeKeyWrite (`floor.ts:98`, via `stepDeliveryOf` returning `relation` at `floor.ts:82`)."
biases:
  - "The floor delivers ONE view per step; a participant that wakes both views (the lean anchor, by design: `adapters/baseline-array.ts` relation `settle` renders both on any write) pays two deliveries per step, so its multiple includes a redundant delivery the floor does not. That is intended, and makes every multiple an over-estimate of store work."
  - "The owner-to-lines mapping is computed in `prepare` (`scenarios.ts:5146-5158`), as the adapters do in `holdRelation`; the floor and the participants are on the same footing about the join."
  - "The mark half allocates a template string per step (`scenarios.ts:5184`), as the participants' script does (`scenarios.ts:5005`); both sides carry it. The name half writes prepared strings (`RELATION_NAMES`, `scenarios.ts:4761-4764`), as `relationWrite` does."
summary: "The delivery-only share of the two relation scripts, measured with no store; a valid divisor for them, not a workload."
---

## The script

`scenarios.ts:5049-5224`: 8 steps write a name into the two lines one owner fills and deliver
view A (`:5175-5180`), then 8 steps write each pair mark and deliver view B (`:5181-5186`).
`steps` = 16 (`:5140`). `check` (`:5188-5191`) demands 8 and 8 distinct states, and 8 lines per
delivery on view B only (`consumers.b.rowCount()`; view A's line count is not asked). The oracle
replays both halves through its own maps and `emitRelation` (`:5201-5223`, `oracle.ts:184`).

## Is it a bound

For the work it contains, yes: every relation participant must at minimum produce the text and
call `deliverRelation`, which this does with array writes and no lookup. Whether any measured
row comes out under it is unverified by this card; `UNBOUNDED_BECAUSE` (`floor.ts:108-119`) names
the mount family as the one whose floor was beaten, and does not say this of relations.

## Standing (own record, `scenarios.ts:5081-5139`)

- B1 MET (`:5103-5107`) holds: no join in the floor.
- B4 MET (`:5115-5118`) holds as far as the code shows (`floor.ts:98`; `standard.ts:472-486`
  checks the step shape of the floor matches the table's).
- C2 MET (`:5123-5126`): its falsifier is this row measured under a different sampling plan from
  the tables it scales; the plan is derived per scenario from that scenario's own probes
  (`cells/runBatch.ts:43-56`), so a different plan is expected. The same note is on the
  `singleFloor` card.
- C5 NOT MET (`:5134-5138`) holds.
