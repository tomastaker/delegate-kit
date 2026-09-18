import { readJSON, accessOf } from './presets.mjs';
const fields = readJSON(new URL('../assets/result-fields.json', import.meta.url));

export function resultSchema(agent) {
  const roles = { reviewer: ['findings'], verifier: ['findings'], 'review-lead': ['plan', 'findings'], planner: ['plan'], researcher: ['sources'] };
  const payload = accessOf(agent) === 'workspace-write' ? ['changes', 'checks_run'] : Object.hasOwn(roles, agent.role) ? roles[agent.role] : [];
  const names = ['status', 'summary', 'not_verified', 'questions', ...payload];
  return { type: 'object', additionalProperties: false,
    properties: Object.fromEntries(names.map(name => [name, fields[name]])), required: names };
}
