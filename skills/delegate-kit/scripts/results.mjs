import { readJSON, accessOf } from './presets.mjs';
const fields = readJSON(new URL('../assets/result-fields.json', import.meta.url));

export function resultSchema(agent, requiredChecks = []) {
  const roles = { reviewer: ['findings'], verifier: ['findings'], 'review-lead': ['plan', 'findings'], planner: ['plan'], researcher: ['sources'] };
  const payload = accessOf(agent) === 'workspace-write' ? ['changes', 'checks_run'] : Object.hasOwn(roles, agent.role) ? roles[agent.role] : [];
  const names = ['status', 'summary', 'not_verified', 'questions', ...payload];
  const schema = { type: 'object', additionalProperties: false,
    properties: Object.fromEntries(names.map(name => [name, fields[name]])), required: names };
  if (requiredChecks.length) {
    schema.required.push('check_results');
    schema.properties.check_results = { type: 'array', description: 'One entry per assigned mandatory check. Worker claims, not independent acceptance evidence.',
      items: { type: 'object', additionalProperties: false, required: ['id', 'status', 'evidence'], properties: {
        id: { type: 'string', enum: requiredChecks },
        status: { type: 'string', enum: ['passed', 'failed', 'blocked', 'not_run'] },
        evidence: { type: 'string', description: 'Actual command, observed outcome and tested workspace/target; or the concrete blocker.' },
      } } };
  }
  return schema;
}

export function checkResultCoverage(result, requiredChecks = []) {
  if (!requiredChecks.length) return null; // Earlier saved runs retain their schema.
  const rows = result?.check_results;
  if (!Array.isArray(rows) || rows.length !== requiredChecks.length || new Set(rows.map(r => r.id)).size !== rows.length
    || requiredChecks.some(id => !rows.some(r => r.id === id)) || rows.some(r => !r.evidence?.trim())) return 'Report every required check exactly once with evidence or a blocker';
  if (result.status === 'done' && rows.some(r => r.status !== 'passed')) return 'Mandatory checks remain unverified; use blocked or failed, not done';
  return null;
}
