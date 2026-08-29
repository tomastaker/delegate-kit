---
name: delegate-kit
description: Use before repository work to choose a consistent execution shape: work directly, ask one read-only scout, delegate one coherent task, parallelize 2-3 independent tasks, or request independent review. Works with any capable coding agent or harness; use the host's native agent and worker tools when available.
license: MIT
compatibility: No external runtime is required. Subagents are optional.
---

# Delegate Kit

A compact, host-neutral orchestration policy for a capable coordinator model. It does not replace the current runtime; it teaches the model how to use the agents, workers, tasks, worktrees, and review tools already available.

## Core rules

1. **The current session is the coordinator.** It owns the user's intent, planning, task boundaries, decisions, integration, verification, and final answer.
2. **Use the smallest effective execution shape.** Delegate only for a real gain: isolated context, parallel progress, specialized execution, or independent review.
3. **One worker owns one outcome.** Do not duplicate broad assignments unless the user explicitly wants competing solutions or a second opinion.
4. **Parallel work requires independence.** Shared mutable files, unstable interfaces, or sequential dependencies mean one owner or sequential execution.
5. **Use native capabilities first.** Do not invent cross-provider routing or launch external CLIs unless the user explicitly requests it.
6. **User instructions win.** Explicit model, provider, worker-count, review, or isolation choices override defaults unless unsafe.

Apply this policy without narrating the classification unless that helps the user.

## Preflight

Before acting, identify:

- the concrete deliverable;
- context already known versus context that must be discovered;
- dependencies and shared mutable state;
- risk and cost of a wrong result;
- checks that prove completion.

Choose the smallest matching shape.

### DIRECT

Do the work in the current session when it is localized, coherent, and understandable with current context.

Typical cases: a small fix, explanation, tightly coupled change, or work involving secrets, production state, destructive commands, or irreversible actions.

A frontier coordinator should not outsource ordinary judgment or short implementation merely because subagents exist.

### SCOUT

Use one read-only scout when the main difficulty is finding or verifying information.

Typical cases:

- relevant code may be spread across a large repository or monorepo;
- several plausible locations or causes must be mapped;
- current documentation or external facts must be collected;
- preserving coordinator context is valuable.

The scout returns evidence, relevant files or symbols, invariants, uncertainties, and useful next reads. It does not make the final product or architecture decision.

Start with one scout. Add a second only for genuinely independent questions, such as separate subsystems or competing root-cause hypotheses. After results return, run the preflight again.

### SINGLE

Use one worker when one well-specified deliverable is substantial enough to benefit from a clean context or supervised ownership.

The coordinator still owns the plan, brief, acceptance criteria, review, and integration. If explaining the task costs about as much as doing it, use DIRECT.

### PARALLEL

Use 2-3 workers only when all are true:

- there are distinct deliverables;
- each can be understood and verified independently;
- workers do not need the same mutable state;
- write scopes do not overlap, or stable interfaces separate them;
- parallelism is likely to save meaningful time.

Use one worker per independent outcome.

Normal limits:

- **3 active workers total**;
- **2 concurrent writers**;
- **1 scout by default**;
- **1 independent reviewer by default**.

Exceed them only when the partition is unusually clear or the user explicitly asks. Task size alone never determines worker count.

### SEQUENTIAL

When one result changes the assumptions, interfaces, or files needed by the next task, execute in order.

Examples: schema before API before UI; diagnosis before fix; implementation before review before repair. Sequential workers may preserve context, but dependent work must not be presented as parallel.

## Scale correctly

Repository size changes the cost of finding context, not automatically the number of writers.

- A small change in a monorepo may need one scout and no delegated implementation.
- A large feature with shared contracts may still need one owner.
- Several modest changes in independent packages may justify parallel workers.

**Worker count equals the number of independent outcomes, not the apparent size of the task.**

## Plan before dispatch

Planning belongs to the coordinator because it holds the user conversation.

Before writers start, define:

- outcome and non-goals;
- task boundaries and dependencies;
- ownership of shared files and interfaces;
- acceptance criteria and verification commands;
- risk areas and approval points.

Use a separate planning agent only for an explicit second opinion, an unusually broad design, or plan review. Do not blindly execute another agent's plan.

## Write a self-contained brief

Every worker gets only the context it needs:

```text
Goal:
Scope and owned paths:
Relevant context and evidence:
Constraints and forbidden changes:
Acceptance criteria:
Checks to run:
Expected return:
```

A fresh agent should be able to start without the parent conversation. The brief must be narrow enough to prevent accidental redesign and complete enough to prevent needless rediscovery.

Concurrent writers should use isolated worktrees or branches when supported. Without safe isolation, allow one writer unless scopes are provably disjoint.

Workers do not spawn their own workers unless the coordinator explicitly permits it.

## Supervise without micromanaging

Use native status, messaging, waiting, stop, and resume controls when available.

The coordinator:

- corrects false assumptions or scope drift;
- answers worker questions or asks the user when genuinely blocking;
- waits for every required result before integration;
- stops or replaces only demonstrably stuck, failed, or unsafe workers;
- avoids repeated polling when completion events exist.

Do not finish while required workers are still running. Do not promise a result later.

## Independent review

The author of a non-trivial change does not certify its own work.

A review is independent when it uses a fresh, read-only context and receives the exact requirements and diff.

- Worker-authored code: the coordinator always inspects and verifies it; use a fresh reviewer when the change is non-trivial, risky, or explicitly requested.
- Coordinator-authored code: use a fresh reviewer for non-trivial or risky changes.
- A different model or provider increases independence but is optional unless requested.
- Use one reviewer by default. Add another only for high-risk work, competing evidence, distinct review lenses, or an explicit request.

A reviewer reports concrete findings with severity, location, evidence, impact, and proposed correction. Run mechanical checks before escalating a disagreement to another model.

A behavior-changing fix invalidates prior approval for the affected area. Re-run relevant checks and review.

## Optional model selection

When the host allows model choice, use the least expensive model likely to finish reliably in one pass:

- bounded lookup or extraction: fast capable model;
- clear limited implementation: balanced model;
- multi-module integration or ambiguous debugging: strong model;
- architecture, security, concurrency, migrations, or high-risk review: strongest suitable model.

Cheap models can cost more through extra turns and corrections. Do not hard-code vendors. Explicit user routing takes precedence.

## Worker return

Require a concise structured result:

```text
Status: done | blocked | failed
Result:
Evidence / files:
Checks run:
Not verified:
Risks or questions:
Recommended next step:
```

Treat self-reported success as evidence to inspect, not proof.

## Completion

Before reporting success:

1. integrate only accepted changes;
2. check for conflicts and unintended edits;
3. run narrow checks, then appropriate broader checks;
4. resolve or record open findings;
5. state what was completed, verified, and not verified.

Never delegate a task whose brief costs as much as the work, ask several workers to “investigate everything,” parallelize shared state, allow uncontrolled nested delegation, or accept “done” without evidence and checks.

The goal is not to maximize agent usage. The goal is predictable, economical, and useful delegation.
