import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { check, accessOf, harnesses } from './presets.mjs';

const efforts = {
  codex: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
  claude: ['low', 'medium', 'high', 'xhigh', 'max'],
  pi: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
  omp: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
};
export function discover() {
  return harnesses.map(harness => {
    const r = spawnSync(harness, ['--version'], { encoding: 'utf8', timeout: 5000 });
    // Version only: never print tool stderr, auth configuration or environment.
    const version = r.status === 0 ? (r.stdout || '').match(/\b\d+\.\d+\.\d+(?:[-+][\w.-]+)?/)?.[0] : null;
    return { harness, installed: !r.error || r.error.code !== 'ENOENT', version: version || 'unknown',
      authentication: 'unknown', live_tested: false, models: 'unknown; use the configured executor model picker',
      cli: { fresh: 'supported', resume: 'supported', cancel: 'supported', wait: 'supported',
        access: 'tool restrictions; not a universal OS sandbox', actual_model: ['pi', 'omp'].includes(harness) ? 'runtime message metadata' : 'unknown' } };
  });
}

// Host evidence is supplied by the coordinator after reading the actual tool schema
// and provider discovery. It is a per-run technical attestation, not another team config.
function compatible(e, access, c) {
  if (!c || c.harness !== e.harness || c.verified !== true || !['native', 'paseo'].includes(c.transport)) return false;
  if (!c.version || !c.host || !c.resume || !c.result || !c.cancel || !c.access?.includes(access)) return false;
  if (e.provider !== undefined && e.provider !== c.provider) return false;
  const model = e.inherit_model ? c.current_model : e.model;
  const entry = c.models?.find(m => m.id === model);
  return Boolean(entry && (e.reasoning === undefined || entry.reasoning?.includes(e.reasoning)));
}
export function resolveExecutor(agent, capabilities = [], available = () => true) {
  check(Array.isArray(capabilities), 'Capability evidence must be an array');
  const e = agent.executor, access = accessOf(agent), desired = e.transport || 'auto';
  const host = ['paseo', 'native'].flatMap(t => capabilities.filter(c => c.transport === t)).find(c =>
    (desired === 'auto' || desired === c.transport) && compatible(e, access, c));
  if (host) {
    check(host.transport !== 'native' || (['codex', 'claude'].includes(host.host) && host.host === e.harness), `No native bridge preserving ${e.harness} on ${host.host}; use an explicit CLI route`);
    check(host.transport !== 'native' || host.host !== 'claude' || host.dynamic_roles === true, 'Claude native requires verified discovery of per-run role definitions; use CLI if a restart is required');
    check(host.launch_provider === undefined || host.launch_provider === e.harness, 'Paseo launch provider cannot replace the selected harness');
    check(host.transport !== 'paseo' || host.daemon, 'Paseo capability evidence needs a stable daemon identifier');
    check(host.transport !== 'paseo' || typeof host.mode_ids?.[access] === 'string' && host.mode_ids[access].length > 0, `Paseo capability evidence needs a mode enforcing ${access}`);
    return { ...e, model: e.inherit_model ? host.current_model : e.model, transport: host.transport, access, capability: host, actual_model: null };
  }
  check(desired === 'auto' || desired === 'cli', `${desired} cannot preserve ${e.harness} model/provider/reasoning/access; supply verified host capabilities or choose CLI explicitly`);
  if (desired === 'auto') check(!capabilities.some(c => c.harness === e.harness && ['native', 'paseo'].includes(c.transport) && c.cli_equivalent !== true), 'Host route is incompatible and CLI equivalence is unverified; select transport cli explicitly after checking its provider/account');
  check(!e.inherit_model, 'CLI defaults cannot inherit the parent chat model');
  if (e.provider !== undefined) check(['codex', 'opencode', 'pi', 'omp'].includes(e.harness), `${e.harness}: provider selection is unsupported; use its configured connection without a provider override`);
  if (e.reasoning !== undefined) {
    check(e.harness !== 'gemini', 'Gemini CLI has no reasoning flag');
    check(e.harness === 'opencode' || efforts[e.harness]?.includes(e.reasoning), `${e.harness}: unsupported reasoning ${e.reasoning}`);
  }
  let model = e.model;
  if (e.harness === 'opencode') {
    if (e.provider) { check(!model.includes('/') || model.startsWith(`${e.provider}/`), 'OpenCode model conflicts with provider'); model = model.includes('/') ? model : `${e.provider}/${model}`; }
    check(model.includes('/'), 'OpenCode needs an exact provider/model identifier');
  }
  const cliCapability = capabilities.find(c => c.transport === 'cli' && c.harness === e.harness && c.verified === true && c.version &&
    (e.provider === undefined || c.provider === e.provider) && c.models?.some(m => m.id === model && m.reasoning?.includes(e.reasoning)));
  if (e.harness === 'opencode' && e.reasoning !== undefined) check(cliCapability, 'OpenCode reasoning variant needs verified per-model CLI capability evidence; unknown variants must not be silently ignored');
  if (['pi', 'omp'].includes(e.harness)) check(e.provider, `${e.harness}: specify provider for exact RPC model selection`);
  check(available(e.harness), `${e.harness} CLI is unavailable; the selected profile has not been replaced`);
  return { ...e, model, transport: 'cli', access, ...(cliCapability ? { capability: cliCapability } : {}), actual_model: null };
}

// Native agents inherit placement from the host. A path in the prompt is not a binding.
export function assertWorkspaceBinding(executor, cwd) {
  if (executor.transport !== 'native' || executor.access !== 'workspace-write') return;
  const c = executor.capability, binding = c?.workspace_binding;
  let matches = false;
  if (c?.verified === true && binding?.enforced === true && typeof binding.cwd === 'string' && path.isAbsolute(binding.cwd) && typeof cwd === 'string' && path.isAbsolute(cwd)) {
    try { matches = fs.realpathSync(binding.cwd) === fs.realpathSync(cwd); } catch { /* Missing workspace evidence fails closed. */ }
  }
  check(matches, 'Native writer requires a verified, enforced host binding to the reserved worktree; choose an explicit CLI route when the host cannot provide it');
}

export function bridgeInvocation(meta, prompt) {
  assertWorkspaceBinding(meta.executor, meta.cwd);
  const e = meta.executor, c = e.capability;
  if (e.transport === 'paseo') {
    const modeId = c.mode_ids?.[e.access];
    check(modeId, `Paseo: discover a mode enforcing ${e.access} for ${e.harness}`);
    check(meta.workspace?.owner === 'paseo' && meta.workspace.id, 'Paseo requires an existing Paseo workspace handle');
    return { daemon: c.daemon, tool: meta.resume_of ? 'send_agent_prompt' : 'create_agent',
      arguments: meta.resume_of ? { agentId: meta.transport_session_id, prompt, background: true, notifyOnFinish: true } : {
        title: `Delegate Kit ${meta.profile}`, provider: `${c.launch_provider || e.harness}/${e.model}`, initialPrompt: prompt,
        workspaceId: meta.workspace.id, notifyOnFinish: true,
        settings: { modeId, ...(e.reasoning === undefined ? {} : { thinkingOptionId: e.reasoning }) },
      }, parent_session: meta.parent_session, note: 'Call on the saved daemon in the parent agent context. Attach the returned agentId/workspaceId; wait for completion notification.' };
  }
  if (c.host === 'codex') return {
    tool: meta.resume_of ? 'followup_task' : 'spawn_agent',
    arguments: meta.resume_of ? { target: meta.transport_session_id, message: prompt } : {
      task_name: `dk_${meta.id.replaceAll('-', '_')}`, message: prompt, fork_turns: 'none', model: e.model,
      ...(e.reasoning === undefined ? {} : { reasoning_effort: e.reasoning }),
    }, note: 'Use only the verified host schema. Access is inherited from the host; the brief is not a sandbox. Attach the returned agent ID; ingest the final result.' };
  check(c.host === 'claude', 'Unsupported native bridge');
  return { tool: 'Agent', arguments: meta.resume_of ? { resume: meta.transport_session_id, prompt } : {
    subagent_type: `dk-${meta.id}`, prompt,
  }, definition: { name: `dk-${meta.id}`, model: e.model, ...(e.reasoning === undefined ? {} : { effort: e.reasoning }),
    tools: e.access === 'read-only' ? ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'] : ['Read', 'Glob', 'Grep', 'Edit', 'Write'],
    disallowedTools: ['Agent', 'Task'], instructions: 'Complete only the supplied brief; delegation depth is one.' },
  note: 'Materialize this unique managed definition in the verified Claude agent directory before dispatch. Never overwrite a shared role or a user file.' };
}
