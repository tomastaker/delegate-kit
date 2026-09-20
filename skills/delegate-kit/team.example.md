# Example team

This is an **unconfigured template**, not an executable roster. Replace the placeholders for the profiles you want to use, remove unnecessary roles, and add your own. Profile names are arbitrary. Your current chat is already the coordinator.

For each profile, name its purpose, executor and exact model identifier, or explicitly allow the executor's default/inherited model. Add reasoning, access settings, a launch method or permitted alternatives only when they matter. Omitted settings do not authorize a different model, account or increased access. A role does not imply a particular model family.

The executor may be a native agent, an installed CLI, a configured service or your own launcher. An existing environment profile can supply settings: name it and make its settings available to the coordinator. Specify the execution host and launch instructions if needed. These are instructions for the coordinator, not automatic agent registration.

## researcher

- Use for: bounded code lookup, documentation research and factual questions with identifiable sources.
- Executor: <configure executor or existing profile>.
- Model: <configure an economical model, or explicitly allow the executor default>.

## researcher-hard

- Use for: conflicting evidence, intermittent behavior or investigations spanning several components where a simple lookup cannot establish the cause.
- Executor: <configure executor or existing profile>.
- Model: <configure a stronger research model>.

## planner

- Use for: an independent approach to unresolved architecture, dependencies or consequential tradeoffs when the coordinator needs that contribution.
- Executor: <configure executor or existing profile>.
- Model: <configure a model suited to uncertain decisions>.

## implementer-basic

- Use for: implementation with a clear outcome, bounded edits and understood dependencies; the normal choice for straightforward work, even within a large task.
- Executor: <configure executor or existing profile>.
- Model: <configure an economical implementation model>.

## implementer

- Use for: connected changes across components with understood boundaries that need more reasoning than the basic worker.
- Executor: <configure executor or existing profile>.
- Model: <configure an intermediate implementation model>.

## implementer-hard

- Use for: unresolved invariants, ambiguous boundaries or failures with serious consequences that cannot be reduced to a clear assignment first.
- Executor: <configure executor or existing profile>.
- Model: <configure a strong implementation model>.

## reviewer-basic

- Use for: independent assessment of the combined ordinary-risk change against its requirements and verification evidence.
- Executor: <configure executor or existing profile>.
- Model: <configure a review model>.

## reviewer-hard

- Use for: review of changes with costly failure modes, such as authorization boundaries, payments or destructive data operations.
- Executor: <configure executor or existing profile>.
- Model: <configure a model suited to these risks>.

## Optional fields for any profile

```text
Reasoning: <supported value, if needed>
Access: <authorized mode, if needed>
Launch: <existing tool/profile, command or local instruction path>
Host: <execution machine, if different from the coordinator>
Alternatives: <explicitly permitted substitute profiles or models>
```

For a mixed team, a researcher might use a native agent, an implementer your installed Pi CLI, and a reviewer an existing Claude Code profile. Fill in real model identifiers and launch information for your environment. Adding a UI specialist or an unfamiliar executor requires only another profile here, not changes to the skill.
