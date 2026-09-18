import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { savePreset, loadPreset, setDefault, hash } from '../skills/delegate-kit/scripts/presets.mjs';
import { prepare, launch, attach, ingest, getRun, resume, status, overview } from '../skills/delegate-kit/scripts/runtime.mjs';
import { resultSchema } from '../skills/delegate-kit/scripts/results.mjs';
import { openTask, readTask, checkTask, normalizeContract, submitTask, checkpointTask, verifyTask, acceptTask, showTask, escalateTask, disposeFinding, taskSummary } from '../skills/delegate-kit/scripts/tasks.mjs';

const done = { status: 'done', summary: 'Fixture completion', changes: [], checks_run: [], not_verified: [], plan: [], findings: [], questions: [], sources: [], next_steps: [] };
const session = 'fixture:task';
const cap = cwd => ({ verified: true, host: 'codex', version: 'fixture-v1', harness: 'codex', transport: 'native', resume: true, result: true, cancel: true, access: ['read-only', 'workspace-write'], models: [{ id: 'fixture-model' }], workspace_binding: { cwd, enforced: true } });
function fixture(fn, amend = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-task-'));
  const previous = process.env.DELEGATE_KIT_HOME;
  process.env.DELEGATE_KIT_HOME = path.join(root, 'state');
  const repo = path.join(root, 'repo'), wt = path.join(root, 'writer'), brief = path.join(root, 'spec.md');
  fs.mkdirSync(repo); fs.writeFileSync(brief, 'Implement the approved value.');
  const git = args => { const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  try {
    git(['init', '-q']); fs.writeFileSync(path.join(repo, 'value.txt'), 'before\n'); git(['add', '.']);
    git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Initial']);
    git(['worktree', 'add', '-qb', 'fixture-writer', wt]);
    const agent = role => ({ role, when: 'Fixture work', executor: { harness: 'codex', transport: 'native', model: 'fixture-model' } });
    savePreset({ schema_version: 2, id: 'Test', agents: { writer: agent('implementer'), stronger: agent('implementer'), economy: { ...agent('implementer'), routing: { tier: 'economy' } }, reviewer: agent('reviewer') } });
    setDefault('Test');
    const work = { id: 'work', required: true, profile: 'writer', routing: { defined: true, risk: 'ordinary', reason: 'Bounded file replacement' }, scope: { include: ['value.txt'], exclude: [] }, dependencies: [], checks: ['value'], resources: [] };
    const contract = { version: 1, session, task: 'task', repo, base: 'HEAD', specification: { path: brief, digest: hash(fs.readFileSync(brief, 'utf8')), goal: 'Approved value', requirements: [{ id: 'R1', text: 'The value is after' }], non_goals: [] }, work_items: [work], checks: [{ id: 'value', requirements: ['R1'], argv: [process.execPath, '-e', "const fs=require('node:fs');if(fs.readFileSync('value.txt','utf8')!=='after\\n')process.exit(1)"], cwd: '.', expected_exit: 0, required: true }], review: { required: true, profiles: ['reviewer'], coverage: ['R1'] }, quality: [], finishing: [], integration_owner: 'coordinator' };
    amend(contract);
    const state = openTask(contract);
    const prepareRuns = (extra = {}) => prepare({ session, task: 'task', agent: 'writer', workItem: 'work', cwd: wt, brief, capabilities: [cap(wt)], ...extra }).runs;
    const prep = extra => prepareRuns(extra)[0];
    const complete = (run, result = done) => {
      if (getRun(run.id).status === 'prepared') launch(run.id); const host = getRun(run.id).transport_session_id || `host-${run.id}`; attach(run.id, host); const token = getRun(run.id).claim;
      ingest(run.id, { event: 'complete', hostAgent: host, stopped: true, dispatchToken: token, result: { dispatch_token: token, result: Object.fromEntries(Object.entries(result).filter(([key]) => Object.hasOwn(resultSchema(getRun(run.id).agent).properties, key))) } }); return getRun(run.id);
    };
    const submit = (run, outcome = 'passed') => submitTask(session, 'task', state.revision, run.work_item || 'work', run.id, outcome, 'Observed fixture result');
    const ready = () => {
      const writer = prep(); fs.writeFileSync(path.join(wt, 'value.txt'), 'after\n'); complete(writer); submit(getRun(writer.id));
      const checkpoint = checkpointTask(session, 'task', state.revision, wt);
      assert.equal(verifyTask(checkpoint.id, 'value').status, 'passed'); return checkpoint;
    };
    const review = (checkpoint, result = done) => complete(prep({ agent: 'reviewer', workItem: undefined, checkpoint: checkpoint.id }), result);
    return fn({ root, repo, wt, brief, contract, state, prep, prepareRuns, complete, submit, ready, review, git });
  } finally {
    if (previous === undefined) delete process.env.DELEGATE_KIT_HOME; else process.env.DELEGATE_KIT_HOME = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('task lifecycle requires runtime checks and fresh review before verified acceptance', () => fixture(({ state, ready, review }) => {
  const cp = ready();
  assert.throws(() => acceptTask(session, 'task', state.revision, cp.id), /review:reviewer/);
  const run = review(cp); assert.equal(run.cwd, cp.cwd); assert.equal(run.review_tree, cp.tree);
  const accepted = acceptTask(session, 'task', state.revision, cp.id);
  assert.equal(accepted.status, 'verified');
  assert.equal(overview({ session, task: 'task' }).summary.verified_tasks, 1);
  assert.equal(acceptTask(session, 'task', state.revision, cp.id).events.length, accepted.events.length);
}));
test('source changes after review invalidate task acceptance and displayed status', () => fixture(({ state, ready, review, wt }) => {
  const cp = ready(); review(cp); acceptTask(session, 'task', state.revision, cp.id);
  fs.writeFileSync(path.join(wt, 'value.txt'), 'changed after review\n');
  assert.throws(() => acceptTask(session, 'task', state.revision, cp.id), /Stale checkpoint/);
  assert.equal(showTask(session, 'task').status, 'unverified');
}));
test('reviewer done with a substantive finding blocks verification; exceptions remain explicit', () => fixture(({ state, ready, review }) => {
  const cp = ready(); const run = review(cp, { ...done, findings: [{ severity: 'high', kind: 'correctness', lens: 'correctness', file: 'value.txt', line: 1, claim: 'Contract gap', evidence: 'Reproducible evidence', suggested_fix: null, verdict: 'confirmed', raised_by: null }] });
  assert.throws(() => acceptTask(session, 'task', state.revision, cp.id), /finding:/);
  assert.throws(() => disposeFinding(session, 'task', state.revision, cp.id, `${run.id}-0`, 'fixed', 'Claimed fixed'), /new checkpoint/);
  const accepted = acceptTask(session, 'task', state.revision, cp.id, 'User explicitly accepts the demonstrated gap');
  assert.equal(accepted.status, 'accepted_with_exceptions'); assert.ok(accepted.exceptions.some(g => g.startsWith('finding:')));
}));
test('two failed submissions exhaust the profile and require explicit fresh-profile escalation', () => fixture(({ state, prep, complete, submit }) => {
  for (let i = 0; i < 2; i++) { const run = prep(); complete(run, { ...done, status: 'failed' }); submit(getRun(run.id), 'failed'); }
  assert.equal(showTask(session, 'task').work_items[0].escalation_required, true);
  assert.throws(() => prep(), /escalation_required/);
  escalateTask(session, 'task', state.revision, 'work', 'stronger', 'Repeated incorrect solutions');
  const next = prep({ agent: 'stronger' }); complete(next);
  assert.equal(getRun(next.id).resume_of, null); assert.equal(showTask(session, 'task').work_items[0].profile, 'stronger');
}));
test('economy writers require ordinary risk, objective checks and independent review', () => {
  for (const [mutate, error] of [
    [c => { c.work_items[0].routing.risk = 'high'; }, /ordinary-risk/],
    [c => { c.work_items[0].checks = []; }, /objective checks/],
    [c => { c.review.required = false; c.review.profiles = []; }, /independent review/],
  ]) fixture(({ prep }) => assert.throws(() => prep({ agent: 'economy' }), error), c => { c.work_items[0].profile = 'economy'; mutate(c); });
  fixture(({ prep, complete }) => complete(prep({ agent: 'economy' })), c => { c.work_items[0].profile = 'economy'; });
});
test('dependent work cannot start before a successful prerequisite submission', () => fixture(({ prep, complete, submit }) => {
  assert.throws(() => prep({ workItem: 'dependent' }), /Dependency work/);
  const first = prep(); complete(first); submit(getRun(first.id));
  complete(prep({ workItem: 'dependent' }));
}, c => c.work_items.push({ ...structuredClone(c.work_items[0]), id: 'dependent', dependencies: ['work'] })));
test('shared resource capacity and exclusive claims prevent competing work admission', () => {
  for (const mode of ['shared', 'exclusive']) fixture(({ prep, complete }) => {
    const first = prep();
    assert.throws(() => prep({ workItem: 'other' }), mode === 'shared' ? /capacity reached/ : /is busy/);
    complete(first); complete(prep({ workItem: 'other' }));
  }, c => {
    c.work_items[0].resources = [{ name: 'fixture-resource', mode, capacity: 1 }];
    c.work_items.push({ ...structuredClone(c.work_items[0]), id: 'other' });
  });
});
test('contract revision conflicts and worker depth reject task policy changes', () => fixture(({ contract, state, prep }) => {
  assert.throws(() => openTask(contract, 'old-revision', 'Update'), /revision conflict/);
  const revised = { ...contract, quality: ['Review usability'] };
  openTask(revised, state.revision, 'Add quality expectation');
  assert.throws(() => submitTask(session, 'task', state.revision, 'work', 'missing', 'failed', 'Reason'), /revision conflict/);
  process.env.DELEGATE_KIT_DEPTH = '1';
  try {
    assert.throws(() => openTask(contract), /coordinator-owned/);
    assert.throws(() => prep(), /Worker cannot delegate/);
    assert.throws(() => checkpointTask(session, 'task', readTask(session, 'task').revision, '.'), /coordinator-owned/);
  } finally { delete process.env.DELEGATE_KIT_DEPTH; }
}));

test('initial checkpoint reviewer cannot reuse a stopped writer session', () => fixture(({ state, prep, complete, submit, wt }) => {
  const writer = prep(); fs.writeFileSync(path.join(wt, 'value.txt'), 'after\n'); complete(writer); submit(getRun(writer.id));
  const cp = checkpointTask(session, 'task', state.revision, wt);
  const reviewer = prep({ agent: 'reviewer', workItem: undefined, checkpoint: cp.id }); launch(reviewer.id);
  assert.throws(() => attach(reviewer.id, getRun(writer.id).transport_session_id), /fresh executor session/);
  assert.equal(getRun(reviewer.id).host_attached, false);
  complete(reviewer);
}));
function reviewerPair() {
  const loaded = loadPreset('Test');
  loaded.preset.agents.reviewer.review = { also_run: ['companion'] };
  loaded.preset.agents.companion = { role: 'reviewer', when: 'Second independent lens', executor: { harness: 'codex', transport: 'native', model: 'fixture-model' } };
  savePreset(loaded.preset, loaded.revision);
}
test('also_run companion uncertainty blocks acceptance and its continuation preserves the review group', () => fixture(({ state, ready, prepareRuns, complete, brief }) => {
  reviewerPair(); const cp = ready();
  const pair = prepareRuns({ agent: 'reviewer', workItem: undefined, checkpoint: cp.id });
  assert.equal(pair.length, 2);
  const lead = pair.find(r => r.profile === 'reviewer'), companion = pair.find(r => r.profile === 'companion');
  complete(lead); complete(companion, { ...done, not_verified: ['Requirement R1 remains unverified'] });
  assert.throws(() => acceptTask(session, 'task', state.revision, cp.id), /review:companion/);
  const retry = resume(companion.id, brief);
  assert.equal(getRun(retry.id).group, getRun(companion.id).group);
  assert.equal(getRun(retry.id).checkpoint, cp.id);
  complete(retry);
  assert.equal(getRun(retry.id).transport_session_id, getRun(companion.id).transport_session_id);
  assert.equal(acceptTask(session, 'task', state.revision, cp.id).status, 'verified');
}));
test('preparing another bound run invalidates the previously verified task status', () => fixture(({ state, ready, review, prep, complete }) => {
  const cp = ready(); review(cp); acceptTask(session, 'task', state.revision, cp.id);
  assert.equal(readTask(session, 'task').status, 'verified');
  const next = prep();
  assert.equal(readTask(session, 'task').status, 'unverified');
  assert.equal(showTask(session, 'task').status, 'unverified');
  complete(next);
}));
test('a latest failed prerequisite submission supersedes its earlier success', () => fixture(({ prep, complete, submit }) => {
  const first = prep(); complete(first); submit(getRun(first.id));
  const second = prep(); complete(second, { ...done, status: 'failed' }); submit(getRun(second.id), 'failed');
  assert.throws(() => prep({ workItem: 'dependent' }), /Dependency work/);
}, c => c.work_items.push({ ...structuredClone(c.work_items[0]), id: 'dependent', dependencies: ['work'] })));
test('mutating the frozen specification invalidates checkpoint evidence and acceptance', () => fixture(({ state, ready, review }) => {
  const cp = ready(); review(cp);
  assert.ok(cp.spec_path); fs.writeFileSync(cp.spec_path, 'Different acceptance requirements');
  assert.throws(() => verifyTask(cp.id, 'value'), /frozen specification changed/);
  assert.throws(() => acceptTask(session, 'task', state.revision, cp.id), /frozen specification changed/);
  assert.equal(showTask(session, 'task').status, 'unverified');
}));
test('successful worker claims cannot submit changes outside the assigned ownership scope', () => fixture(({ prep, complete, submit, wt }) => {
  const writer = prep(); fs.writeFileSync(path.join(wt, 'outside.txt'), 'Unauthorised scope extension'); complete(writer);
  assert.throws(() => submit(getRun(writer.id)), /outside ownership scope/);
  assert.equal(readTask(session, 'task').submissions.length, 0);
}));
test('an integrated checkpoint must retain the actual submitted file changes', () => fixture(({ state, prep, complete, submit, wt }) => {
  const writer = prep(); fs.writeFileSync(path.join(wt, 'value.txt'), 'after\n'); complete(writer); submit(getRun(writer.id));
  fs.writeFileSync(path.join(wt, 'value.txt'), 'before\n');
  assert.throws(() => checkpointTask(session, 'task', state.revision, wt), /Integrated result differs from submission/);
  assert.equal(readTask(session, 'task').current_checkpoint, null);
}));
test('three work items share one profile concurrently with separate worktrees and failure budgets', () => fixture(({ root, repo, wt, git, state, prep, complete, submit }) => {
  const second = path.join(root, 'writer-second'), third = path.join(root, 'writer-third');
  git(['worktree', 'add', '-qb', 'fixture-second', second]);
  git(['worktree', 'add', '-qb', 'fixture-third', third]);
  const a = prep();
  const b = prep({ workItem: 'second', cwd: second, capabilities: [cap(second)] });
  const c = prep({ workItem: 'third', cwd: third, capabilities: [cap(third)] });
  assert.deepEqual([a, b, c].map(r => getRun(r.id).status), ['prepared', 'prepared', 'prepared']);
  assert.equal(new Set([a, b, c].map(r => r.id)).size, 3);
  complete(a, { ...done, status: 'failed' }); submit(getRun(a.id), 'failed');
  fs.writeFileSync(path.join(second, 'second.txt'), 'second result\n'); complete(b); submit(getRun(b.id));
  fs.writeFileSync(path.join(third, 'third.txt'), 'third result\n'); complete(c); submit(getRun(c.id));
  assert.deepEqual(showTask(session, 'task').work_items.map(w => [w.id, w.failures]), [['work', 1], ['second', 0], ['third', 0]]);
  const retry = prep(); fs.writeFileSync(path.join(wt, 'value.txt'), 'after\n'); complete(retry); submit(getRun(retry.id));
  fs.copyFileSync(path.join(wt, 'value.txt'), path.join(repo, 'value.txt'));
  fs.copyFileSync(path.join(second, 'second.txt'), path.join(repo, 'second.txt'));
  assert.throws(() => checkpointTask(session, 'task', state.revision, repo), /Integrated result differs from submission: third\/third.txt/);
  fs.copyFileSync(path.join(third, 'third.txt'), path.join(repo, 'third.txt'));
  assert.ok(checkpointTask(session, 'task', state.revision, repo).id);
}, contract => {
  for (const id of ['second', 'third']) contract.work_items.push({ ...structuredClone(contract.work_items[0]), id, scope: { include: [`${id}.txt`], exclude: [] } });
}));
test('refuting a finding requires a passed current runtime receipt', () => fixture(({ state, ready, review }) => {
  const cp = ready();
  const run = review(cp, { ...done, findings: [{ severity: 'medium', kind: 'spec', lens: 'spec', file: 'value.txt', line: 1, claim: 'Value is not after', evidence: 'Reviewer claim', suggested_fix: null, verdict: 'confirmed', raised_by: null }] });
  const finding = `${run.id}-0`;
  assert.throws(() => disposeFinding(session, 'task', state.revision, cp.id, finding, 'refuted', 'Value is after'), /runtime evidence ID/);
  const evidence = readTask(session, 'task').evidence.find(e => e.checkpoint_id === cp.id && e.check_id === 'value');
  disposeFinding(session, 'task', state.revision, cp.id, finding, 'refuted', 'Approved value check reads the file and asserts the exact required text', undefined, evidence.id);
  assert.equal(acceptTask(session, 'task', state.revision, cp.id).status, 'verified');
}));
test('uncertain and capability outcomes block another attempt until explicit escalation', () => {
  for (const outcome of ['uncertain', 'capability']) fixture(({ state, prep, complete, submit }) => {
    const run = prep(); complete(run, { ...done, status: 'blocked' }); submit(getRun(run.id), outcome);
    assert.throws(() => prep(), /Work item blocked/);
    assert.equal(showTask(session, 'task').work_items[0].failures, 0);
    escalateTask(session, 'task', state.revision, 'work', 'stronger', 'Explicitly assign a profile able to resolve the blocker');
    complete(prep({ agent: 'stronger' }));
  });
});
test('nontrivial tasks cannot become verified by disabling review in the contract', () => fixture(({ state, ready }) => {
  const cp = ready();
  assert.throws(() => acceptTask(session, 'task', state.revision, cp.id), /review/);
}, c => { c.review.required = false; c.review.profiles = []; }));

test('a new writer on another worktree supersedes old acceptance even before integration changes', () => {
  for (const outcome of ['unsubmitted', 'failed']) fixture(({ root, state, ready, review, git, prep, complete, submit }) => {
    const cp = ready(); review(cp); acceptTask(session, 'task', state.revision, cp.id);
    const another = path.join(root, 'another-writer'); git(['worktree', 'add', '-qb', 'another-writer', another]);
    const run = prep({ cwd: another, capabilities: [cap(another)] });
    assert.equal(readTask(session, 'task').current_checkpoint, null);
    assert.equal(showTask(session, 'task').status, 'unverified');
    complete(run, outcome === 'failed' ? { ...done, status: 'failed' } : done);
    if (outcome === 'failed') submit(getRun(run.id), 'failed');
    // The accepted source itself is unchanged: a stale checkpoint must still fail.
    assert.equal(fs.readFileSync(path.join(cp.source_cwd, 'value.txt'), 'utf8'), 'after\n');
    assert.throws(() => acceptTask(session, 'task', state.revision, cp.id), /current checkpoint/);
  });
});
test('a declared dependent work item can supersede the prerequisite file result', () => fixture(({ wt, state, prep, complete, submit, review }) => {
  const first = prep(); fs.writeFileSync(path.join(wt, 'value.txt'), 'intermediate\n'); complete(first); submit(getRun(first.id));
  const second = prep({ workItem: 'dependent' }); fs.writeFileSync(path.join(wt, 'value.txt'), 'after\n'); complete(second); submit(getRun(second.id));
  const cp = checkpointTask(session, 'task', state.revision, wt);
  assert.equal(verifyTask(cp.id, 'value').status, 'passed'); review(cp);
  assert.equal(acceptTask(session, 'task', state.revision, cp.id).status, 'verified');
}, c => c.work_items.push({ ...structuredClone(c.work_items[0]), id: 'dependent', dependencies: ['work'] })));
test('an unrelated work item cannot silently supersede another submitted file', () => fixture(({ wt, state, prep, complete, submit }) => {
  const first = prep(); fs.writeFileSync(path.join(wt, 'value.txt'), 'first result\n'); complete(first); submit(getRun(first.id));
  const second = prep({ workItem: 'unrelated' }); fs.writeFileSync(path.join(wt, 'value.txt'), 'after\n'); complete(second); submit(getRun(second.id));
  assert.throws(() => checkpointTask(session, 'task', state.revision, wt), /overlap|conflict|Integrated result differs/i);
  assert.equal(readTask(session, 'task').current_checkpoint, null);
}, c => c.work_items.push({ ...structuredClone(c.work_items[0]), id: 'unrelated' })));

test('simple CLI flow resolves profile, brief, revision and checkpoint; unchanged check reuses evidence', () => fixture(({ prep, complete, wt, ready, root }) => {
  const run = prep({ agent: undefined, brief: undefined });
  assert.equal(run.profile, 'writer'); fs.writeFileSync(path.join(wt, 'value.txt'), 'after\n'); complete(run);
  const cli = (...args) => {
    const r = spawnSync(process.execPath, [new URL('../skills/delegate-kit/scripts/dk.mjs', import.meta.url).pathname, ...args, '--session', session, '--task', 'task'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout);
  };
  assert.throws(() => checkTask(session, 'task', wt, { revision: 'stale' }), /revision conflict/);
  assert.throws(() => checkTask(session, 'task', wt, { checkpoint: 'stale' }), /Checkpoint conflict/);
  const first = cli('task', 'check', '--cwd', wt);
  assert.ok(first.checkpoint); assert.deepEqual(first.gaps, ['review:reviewer']); assert.equal(first.events, undefined);
  assert.equal(readTask(session, 'task').submissions.length, 1); assert.equal(readTask(session, 'task').evidence.length, 1);
  assert.equal(cli('task', 'check', '--cwd', wt).checkpoint, first.checkpoint);
  assert.equal(readTask(session, 'task').evidence.length, 1);
  cli('task', 'check', '--cwd', wt, '--rerun'); assert.equal(readTask(session, 'task').evidence.length, 2);
  const review = prep({ agent: 'reviewer', workItem: undefined, checkpoint: 'current', brief: undefined }); complete(review);
  assert.equal(cli('task', 'accept').status, 'verified');
  assert.ok(cli('task', 'show', '--details').contract);
}));

test('failed checking stays unverified, and corrected source gets a new snapshot', () => fixture(({ prep, complete, wt }) => {
  const run = prep(); complete(run);
  const first = checkTask(session, 'task', wt); assert.ok(first.gaps.includes('check:value'));
  fs.writeFileSync(path.join(wt, 'value.txt'), 'after\n');
  const second = checkTask(session, 'task', wt);
  assert.notEqual(second.current_checkpoint, first.current_checkpoint); assert.ok(!second.gaps.includes('check:value'));
}));

test('collected completion can be rejected once after checks, preserving semantic failure accounting', () => fixture(({ prep, complete, wt, state }) => {
  const run = prep(); complete(run); const checked = checkTask(session, 'task', wt);
  assert.ok(checked.current_checkpoint);
  const rejected = submitTask(session, 'task', state.revision, 'work', run.id, 'failed', 'Required value was not implemented');
  assert.equal(rejected.current_checkpoint, null); assert.equal(showTask(session, 'task').work_items[0].failures, 1);
  submitTask(session, 'task', state.revision, 'work', run.id, 'failed', 'Required value was not implemented');
  assert.equal(showTask(session, 'task').work_items[0].failures, 1);
  assert.throws(() => submitTask(session, 'task', state.revision, 'work', run.id, 'passed', 'Undo'), /Conflicting submission/);
}));

test('frozen source citation can refute an inspectable finding; invalid ranges and paths fail', () => fixture(({ state, ready, review }) => {
  const cp = ready();
  review(cp, { ...done, findings: [{ severity: 'medium', kind: 'correctness', lens: 'correctness', file: 'value.txt', line: 1, claim: 'File still contains before', evidence: 'Observed file', suggested_fix: null, verdict: null, raised_by: null }] });
  const finding = showTask(session, 'task').findings[0].id;
  const dispose = source => disposeFinding(session, 'task', state.revision, cp.id, finding, 'refuted', 'The frozen line is after, contrary to the claim', undefined, undefined, source);
  assert.throws(() => dispose({ file: '../specification.md', start: 1, end: 1 }), /relative path/);
  assert.throws(() => dispose({ file: 'value.txt', start: 1, end: 100 }), /exceeds/);
  dispose({ file: 'value.txt', start: 1, end: 1 });
  assert.equal(readTask(session, 'task').dispositions.at(-1).source.excerpt, 'after');
  assert.equal(acceptTask(session, 'task', state.revision, cp.id).status, 'verified');
}));

test('writer cannot bypass task contract while read-only standalone work stays lightweight', () => fixture(({ prep, complete }) => {
  assert.throws(() => prep({ task: 'no-contract', workItem: undefined }), /Open a task contract/);
  const run = prep({ task: 'research', agent: 'reviewer', workItem: undefined }); complete(run);
  assert.equal(status(run.id).task_result.status, 'standalone_read_only');
}));

test('contract normalization fills mechanics without mutating input or overriding explicit constraints', () => fixture(({ contract }) => {
  const input = structuredClone(contract); delete input.version; delete input.base; delete input.specification.digest; delete input.specification.non_goals;
  delete input.work_items[0].dependencies; delete input.work_items[0].resources; delete input.checks[0].cwd; input.checks[0].required = false;
  const normalized = normalizeContract(input);
  assert.equal(normalized.specification.digest, contract.specification.digest); assert.equal(normalized.base, 'HEAD');
  assert.deepEqual(normalized.work_items[0].resources, []); assert.equal(normalized.checks[0].required, false); assert.equal(input.base, undefined);
}));

test('source citations preserve blank lines and indentation exactly', () => fixture(({ prep, complete, submit, state, wt, review }) => {
  const run = prep(); fs.writeFileSync(path.join(wt, 'value.txt'), '\n  after\n'); complete(run); submit(run);
  const cp = checkpointTask(session, 'task', state.revision, wt);
  review(cp, { ...done, findings: [{ severity: 'low', kind: 'correctness', lens: 'correctness', file: 'value.txt', line: 2, claim: 'Line two is empty', evidence: null, suggested_fix: null, verdict: null, raised_by: null }] });
  const finding = showTask(session, 'task').findings[0].id;
  disposeFinding(session, 'task', state.revision, cp.id, finding, 'refuted', 'Line two contains an indented value', undefined, undefined, { file: 'value.txt', start: 2, end: 2 });
  assert.equal(readTask(session, 'task').dispositions.at(-1).source.excerpt, '  after');
}));

test('review continuation order follows recorded dispatch even when the clock moves backward', () => fixture(({ root, state, ready, review, complete, brief }) => {
  const cp = ready(); const first = review(cp); const next = resume(first.id, brief);
  const file = path.join(root, 'state/runs', next.id, 'meta.json');
  const meta = JSON.parse(fs.readFileSync(file)); meta.created = '2000-01-01T00:00:00.000Z'; fs.writeFileSync(file, JSON.stringify(meta));
  complete(next, { ...done, status: 'blocked', questions: ['Cannot complete review'] });
  assert.throws(() => acceptTask(session, 'task', state.revision, cp.id), /review:reviewer/);
}));

test('missing saved evidence removes verified status from task and team overview', () => fixture(({ state, ready, review }) => {
  const cp = ready(); review(cp); acceptTask(session, 'task', state.revision, cp.id);
  fs.unlinkSync(readTask(session, 'task').evidence[0].stdout_path);
  assert.equal(showTask(session, 'task').status, 'unverified');
  assert.equal(overview({ session, task: 'task' }).summary.verified_tasks, 0);
}));
