# Quality

A task is done when its behavior has been observed working, not when the code reads correctly or builds. Models reliably check code by reading it; they less reliably exercise it — run the command, call the API, open the interface. This file closes that gap. Match the depth of checking to the change and its risk; stricter project requirements still apply.

## Brief

Every assignment states the outcome, editable scope, the finish line and how the result will be demonstrated. For an obvious change a sentence each is enough.

## Evidence by change type

- Logic or API: run the relevant test, command or request and report the observed output. For a bug, reproduce it first or show the concrete cause.
- Scripts, CLI, integrations and data changes: run the real path end to end on authorized data and report the observed result.
- User interface: open the running product in a browser or the app. Follow the user's path through the changed element (open the menu, pick an option, submit the form), confirm the resulting state, and take a screenshot of the affected area. Check the viewport sizes, long content, empty and error states, and keyboard focus that the change could affect.
- Saved data: reload or reopen and confirm the value persisted.
- Text and research: check accuracy, sources and completeness; code and UI checks do not apply.

A build proves it compiles, a screenshot proves appearance, and a click without checking the result proves neither. Add a regression test when it protects real behavior at reasonable cost, not for reversible cosmetic edits.

## Report

Return what was checked, how, and what was observed, with screenshots for UI. List what was not checked and why. An unchecked item is acceptable; presenting it as checked is not. Keep failures visible instead of weakening checks.

## Review

Code changes get one independent review from the other family (see [team.md](team.md)), except trivial, reversible edits such as copy or one-line config. High-risk changes get cross-review: both families in parallel, independently, on the same stable revision.

The reviewer gets the acceptance criteria and the evidence, and does not edit. It reports every finding with severity (blocker, should-fix, optional) and confidence, backed by a scenario, test or clear reasoning. A change without evidence of its behavior, such as a UI change without the user path, is a blocker. Unrelated risks are reported separately.

## Finish

Fix confirmed blockers in one focused pass, recheck the affected behavior, and let the same reviewer confirm closure. If the same failure repeats without new evidence, reconsider the approach; move to a more expensive model only after that, and with a notice. The coordinator accepts the task after looking at the evidence itself, including UI screenshots, and reports the result, checks performed, gaps and separate findings.
