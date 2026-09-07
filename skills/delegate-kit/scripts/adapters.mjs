// Transport-specific flags and event formats. See references/providers.md for sources.
import fs from 'node:fs';
import path from 'node:path';
import { narrowPermissions } from './opencode-permissions.mjs';
const present = value => value !== null && value !== undefined;
export function buildCommand({ adapter, model, effort, prompt, write, resumeId, skillDir, agentName = 'delegate-kit', permissionRules }) {
  const schema = path.join(skillDir, 'references', 'result-schema.json');
  if (adapter === 'codex') {
    const args = ['exec', ...(resumeId ? ['resume'] : []), '--json', '--skip-git-repo-check', '-c', 'agents.enabled=false'];
    args.push('-c', `sandbox_mode="${write ? 'workspace-write' : 'read-only'}"`);
    if (present(model)) args.push('-m', model);
    if (present(effort)) args.push('-c', `model_reasoning_effort=${JSON.stringify(effort)}`);
    args.push('--output-schema', schema, '-o', '__OUT__');
    if (resumeId) args.push(resumeId);
    args.push(prompt);
    return { cmd: 'codex', args };
  }
  if (adapter === 'claude') {
    const args = ['-p', '--output-format', 'json', '--permission-mode', write ? 'acceptEdits' : 'plan',
      '--disallowedTools', 'Agent,Task', '--json-schema', fs.readFileSync(schema, 'utf8')];
    if (!write) args.push('--tools', 'Read,Glob,Grep,WebFetch,WebSearch', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}');
    if (present(model)) args.push('--model', model);
    if (present(effort)) args.push('--effort', effort);
    if (resumeId) args.push('--resume', resumeId);
    args.push(prompt);
    return { cmd: 'claude', args };
  }
  if (adapter === 'gemini') {
    if (present(effort)) throw new Error('Gemini CLI does not expose --effort');
    const args = ['--output-format', 'stream-json', '--approval-mode', write ? 'auto_edit' : 'plan',
      '--policy', path.join(skillDir, 'references', 'policies', write ? 'gemini-writer.toml' : 'gemini-readonly.toml')];
    if (write) args.push('--sandbox');
    if (present(model)) args.push('--model', model);
    if (resumeId) args.push('--resume', resumeId);
    args.push('--prompt', prompt);
    return { cmd: 'gemini', args };
  }
  if (adapter === 'opencode') {
    if (!model || !model.includes('/')) throw new Error('OpenCode needs provider/model');
    if (!permissionRules) throw new Error('OpenCode requires resolved inherited permissions before launch');
    const permission = narrowPermissions(permissionRules, write);
    const config = { share: 'disabled', agent: { [agentName]: { description: 'Scoped delegate-kit worker', mode: 'primary', permission } } };
    const args = ['run', '--pure', '--format', 'json', '--agent', agentName, '--model', model];
    if (present(effort)) args.push('--variant', effort);
    if (resumeId) args.push('--session', resumeId);
    args.push('--', prompt);
    return { cmd: 'opencode', args, config };
  }
  throw new Error(`Unsupported adapter: ${adapter}`);
}
function parseFinal(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, '$1');
  try { return JSON.parse(trimmed); } catch { return null; }
}
// Validate the subset actually used by the canonical schema, including nested findings.
// A schema keyword outside this subset must be implemented before the schema is extended.
export function validate(value, schema, at = '$') {
  const known = ['title', 'description', 'type', 'enum', 'properties', 'required', 'additionalProperties', 'items'];
  for (const key of Object.keys(schema)) if (!known.includes(key)) throw new Error(`Unsupported schema keyword ${key}`);
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (schema.type && ![].concat(schema.type).some(t => t === type || t === 'integer' && Number.isInteger(value))) return `${at}: invalid type`;
  if (schema.enum && !schema.enum.includes(value)) return `${at}: invalid enum`;
  if (type === 'object') {
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) return `${at}.${key}: missing`;
    for (const key of Object.keys(value)) {
      if (!schema.properties || !Object.hasOwn(schema.properties, key)) { if (schema.additionalProperties === false) return `${at}.${key}: unexpected`; }
      else { const error = validate(value[key], schema.properties[key], `${at}.${key}`); if (error) return error; }
    }
  }
  if (type === 'array' && schema.items) for (let i = 0; i < value.length; i++) { const error = validate(value[i], schema.items, `${at}[${i}]`); if (error) return error; }
  return null;
}
export function extractResult(adapter, stdout, outFile, schema) {
  let text = '', result = null, usage = null, sessionId = null, actualModel = null, error = null, cost = null;
  if (adapter === 'claude') {
    let obj;
    try { obj = JSON.parse(stdout); } catch { obj = stdout.split('\n').map(line => { try { return JSON.parse(line); } catch { return null; } }).findLast(o => o?.type === 'result'); }
    if (obj) {
      result = obj.structured_output || parseFinal(obj.result);
      usage = obj.usage || null; sessionId = obj.session_id || null; cost = obj.total_cost_usd || null;
      if (obj.is_error) error = 'Claude reported an error';
      // modelUsage can include auxiliary models; it is not proof of the main model.
    }
  } else {
    for (const line of stdout.split('\n')) {
      let ev; try { ev = JSON.parse(line); } catch { continue; }
      if (adapter === 'codex') {
        if (ev.type === 'thread.started') sessionId = ev.thread_id || null;
        if (ev.type === 'turn.completed') usage = ev.usage || null;
        if (ev.type === 'item.completed' && ev.item?.type === 'agent_message') text = ev.item.text || '';
        if (ev.type === 'error' || ev.type === 'turn.failed') error = ev.message || ev.error?.message || 'Codex turn failed';
      } else if (adapter === 'gemini') {
        if (ev.type === 'init') sessionId = ev.session_id || null; // init.model is configuration, not execution identity.
        if (ev.type === 'tool_use' || ev.type === 'tool_result') text = '';
        if (ev.type === 'message' && ev.role === 'assistant') { if (ev.delta) text += ev.content || ''; else text = ev.content || ''; }
        if (ev.type === 'result') { usage = ev.stats || null; if (ev.status === 'error') error = ev.error?.message || 'Gemini run failed'; }
        if (ev.type === 'error' && ev.severity === 'error') error = ev.message || 'Gemini error';
      } else if (adapter === 'opencode') {
        sessionId = ev.sessionID || sessionId;
        if (ev.type === 'text') text = ev.part?.text || '';
        if (ev.type === 'step_finish') { usage = ev.part?.tokens || usage; cost = ev.part?.cost ?? cost; }
        if (ev.type === 'error') error = ev.error?.data?.message || 'OpenCode run failed';
      }
    }
    if (adapter === 'codex') { try { text = fs.readFileSync(outFile, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
    result = parseFinal(text);
  }
  const invalid = validate(result, schema);
  if (invalid) error ||= `Invalid worker result: ${invalid}`;
  if (error) result = { status: 'failed', summary: error, changes: [], checks_run: [], not_verified: ['Worker output did not establish completion; inspect logs and worktree.'], plan: [], findings: [], questions: [], sources: [], next_steps: [] };
  return { result, usage, sessionId, actualModel, cost_usd: cost, error };
}
