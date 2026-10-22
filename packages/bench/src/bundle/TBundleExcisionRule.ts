// Prose: ./TBundleExcisionRule.md
// A rule whose `times` does not match is a FAILED RUN, never a smaller excision.
export type TBundleExcisionRule =
    | {
          kind: 'declaration';
          declaration: string;
          times: number;
          what?: string;
      }
    | {
          kind: 'statement';
          starts: RegExp;
          times: number;
          what: string;
      }
    | {
          kind: 'line';
          matches: RegExp;
          times: number;
          what: string;
      };
