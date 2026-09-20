# Quality and acceptance

Apply these requirements at the environment's existing handoff and completion points. The coordinator owns acceptance of the whole task; implementers own their changes and self-checks; an independent reviewer assesses the combined result. Verification depth follows the change and its risks. Equivalent existing checks count, and stricter project requirements remain in force.

## Before implementation

Establish the intended behavior, edit scope, constraints, invariants and observable acceptance criteria. A few sentences suffice for an obvious change. Resolve consequential ambiguity before dependent work; keep expectations anchored to the request instead of adjusting them to whatever was implemented. Each implementer must know its boundaries and how to demonstrate success.

## Before handoff

Verify a coherent finished change, starting with the affected behavior and meaningful consequences. For a bug, reproduce the failure or establish concrete causal evidence. Add a regression test when required by the project or when it can protect the behavior at reasonable maintenance cost. Derive expectations from the requested behavior; justify fixture and snapshot changes on that basis. Keep failures visible rather than weakening checks to pass.

Use project checks and authorized environments. Extend verification when a failure, dependency or concrete risk warrants it. Once required checks pass, proceed; additional checks should resolve a specific question. Unrelated refactoring and a full intermediate audit are not part of ordinary self-checks.

For visual changes, inspect the actual rendered result. For interaction changes, follow the normal user path, confirm the resulting state, and inspect its appearance. Use the available browser or application tools. A build proves buildability, a screenshot proves appearance, and a successful click alone proves neither the intended behavior nor usability.

For example, a dropdown spacing change needs inspection of the open list; a selection change needs opening, choosing and checking the displayed value. A save change also needs reopening to confirm persistence. Check viewport sizes, long content, loading/error states, focus and keyboard behavior when the change puts them at risk. Permanent end-to-end tests are useful when their regression value justifies them, not for every cosmetic edit. Diagnostic shortcuts do not replace evidence that users can complete the action.

Return the checked revision or working state, scenario or command, observed result and useful artifacts. Distinguish real checks from mocked boundaries, unperformed checks and environment limitations. Support claims of pre-existing failures with evidence. Exclude secrets. Missing mandatory browser access remains a verification gap; a build cannot fill it.

An implementer may finish its assignment after returning the result and applicable self-checks, or an explicit blocker. It need not keep its session open through acceptance of the whole task.

## After integration

Account for all assignments and check the combined result against the acceptance criteria, including interactions between changes. The coordinator may assign these checks to someone else. Reuse evidence while the checked behavior and relevant dependencies remain unchanged; a new commit alone does not invalidate it. Refresh affected checks after conflict resolution or subsequent edits that could change their result.

## Independent review

After integration and self-checks, arrange one independent assessment of the stable combined task, including the coordinator's changes. Provide the acceptance criteria, relevant context and verification evidence. Keep the reviewed material stable during assessment. Independence means no authorship of the reviewed change; it does not require another model. Count an equivalent existing review and honor any additional project requirements.

The reviewer returns findings, without editing the change or launching another review chain. Each blocker needs a violated requirement and a supporting scenario, test or clear reasoning. Separate confirmed defects, uncertainties needing a targeted check, optional improvements and unrelated findings. Report serious unrelated risks separately without expanding the task automatically. If independent review is unavailable, report the missing acceptance condition and seek its resolution or an explicit exception; self-review is not independent review.

## Resolve and finish

Group confirmed blockers into a focused correction pass. Fix them or provide evidence that refutes them, then check the affected behavior and consequences. The same independent reviewer can confirm closure, reusing unaffected review results. If a reviewer authors a correction, obtain independent assessment of that correction. Restart the full review only for substantial scope changes or project requirements.

Optional polish does not require another implementation cycle. Repeated failure without new evidence calls for reassessing the approach, not automatic acceptance or an automatic switch to a more expensive model.

Accept when the criteria are met, mandatory checks and independent review apply to the final result, and blockers are resolved or covered by explicit exceptions. Distinguish implementation, verification and acceptance. Report the outcome, evidence, limitations, exceptions and separate findings in the environment's normal format.

For research and text work, verify accuracy, sources and completeness. Apply code and UI checks only when those surfaces are affected; research alone does not trigger implementation or code review.
