import fs from 'node:fs';
import path from 'node:path';
import { readConfig, backendTable, resolve as resolveLegacy } from './routing.mjs';
import { home, hash, check, locked, atomicJSON, readJSON, validatePreset, presetFiles } from './presets.mjs';

// Parent-dependent assignments are resolved only from an explicit migration
// decision. A preset called gpt or claude does not itself supply that decision.
export function migrationPlan(decisions = {}, root = home()) {
  const file = path.join(root, 'config.json');
  check(fs.existsSync(file), 'No legacy config.json found');
  const legacy = readConfig(file), table = backendTable(legacy), issues = [], presets = [];
  const teams = Object.keys(legacy.profiles || {}).length ? legacy.profiles : { legacy: { roles: {} } };
  for (const [id, profile] of Object.entries(teams)) {
    const parent = decisions.parents?.[id];
    if (parent && !table[parent]) { issues.push(`${id}: unknown parent backend ${parent}`); continue; }
    const p = { schema_version: 2, id, defaults: {}, agents: {}, ...(legacy.limits ? { limits: legacy.limits } : {}) };
    const assignments = { ...legacy.roles, ...profile.roles };
    for (const [role, assignment] of Object.entries(assignments)) {
      const candidateKeys = ['model', 'effort', 'family', 'runner', 'backend', 'efforts'];
      const backendMap = !Array.isArray(assignment) && !candidateKeys.some(key => Object.hasOwn(assignment, key));
      if (backendMap && !parent) { issues.push(`${id}.${role}: legacy backend map needs an explicit parents.${id} decision before choosing its default`); continue; }
      const needsAuthor = ['reviewer', 'verifier'].includes(role);
      const author = decisions.authors?.[id];
      if (backendMap && needsAuthor && !author) { issues.push(`${id}.${role}: legacy reviewer routing needs an explicit authors.${id} backend decision`); continue; }
      let selectedBackend = parent, selectedRoute = null;
      if (backendMap) {
        try {
          selectedRoute = resolveLegacy({ parent, role, ...(needsAuthor ? { 'author-backend': author } : {}), ...(legacy.profiles?.[id] ? { profile: id } : {}) }, legacy, {}, () => true);
          selectedBackend = selectedRoute.backend;
        } catch (error) { issues.push(`${id}.${role}: cannot preserve legacy default: ${error.message}`); continue; }
      }
      let candidates = Array.isArray(assignment) ? assignment : !backendMap ? [assignment]
        : Object.entries(assignment).map(([backend, pair]) => ({ backend, model: pair[0], effort: pair[1] || undefined }));
      if (backendMap) {
        if (!candidates.some(candidate => candidate.backend === selectedBackend)) {
          candidates.push({ backend: selectedBackend, model: selectedRoute.model, effort: selectedRoute.effort || undefined });
        }
        candidates.sort((a, b) => Number(b.backend === selectedBackend) - Number(a.backend === selectedBackend));
      }
      candidates.forEach((c, i) => {
        const at = `${id}.${role}[${i + 1}]`;
        const backend = c.backend || (c.family ? Object.keys(table).find(b => table[b].family === c.family && (!c.runner || ['auto', 'native'].includes(c.runner) || table[b].adapter === c.runner)) : parent);
        if (!backend) { issues.push(`${at}: declare parents.${id} or an explicit backend; model does not identify its harness`); return; }
        const entry = table[backend];
        if (legacy.families && !legacy.families.includes(backend)) { issues.push(`${at}: ${backend} is outside the legacy allowed pool`); return; }
        if (legacy.mode === 'solo' && (!parent || table[parent].family !== entry.family)) { issues.push(`${at}: solo restriction needs an explicit compatible parent`); return; }
        if (legacy.mode === 'duo' && !legacy.families) { issues.push(`${at}: duo has no fixed allowed pool; choose it before migration`); return; }
        const usesParent = !c.runner || ['auto', 'native'].includes(c.runner);
        if (usesParent && !parent && (c.runner === 'native' || new Set(Object.values(table).filter(b => b.family === entry.family).map(b => b.adapter)).size > 1)) { issues.push(`${at}: declare parents.${id}; this family has parent-dependent harness selection`); return; }
        if (c.runner === 'native' && table[parent]?.family !== entry.family) { issues.push(`${at}: native runner needs a matching parent family`); return; }
        const harness = usesParent && table[parent]?.family === entry.family ? table[parent].adapter : c.runner && !['native', 'auto'].includes(c.runner) ? c.runner : entry.adapter;
        const model = c.model || entry.model;
        if (!model) { issues.push(`${at}: omitted model/inheritance requires an explicit decision in legacy configuration`); return; }
        const aid = `${role}-${i + 1}`;
        p.agents[aid] = { role, when: i === 0 ? `General ${role} work; original usual assignment.` : `Permitted alternative ${role} for work needing a different approach or deeper analysis; choose deliberately.`,
          executor: { harness, model, ...(c.effort ? { reasoning: c.effort } : {}), ...(c.runner === 'native' ? { transport: 'native' } : c.runner && c.runner !== 'auto' ? { transport: 'cli' } : {}) } };
        p.defaults[role] ||= aid;
      });
    }
    if (legacy.preferences && Object.keys(legacy.preferences).length) issues.push(`${id}: preferences need explicit profile descriptions/defaults; migration will not guess specialization`);
    if (legacy.review?.allow_multiple === false) p.coordination = 'Use one reviewer. Multiple reviewers require an explicit user exception.';
    if (legacy.preset && legacy.preset !== 'auto') issues.push(`${id}: legacy preset ${legacy.preset} depends on coordinator routing; confirm explicit assignments before migration`);
    try { validatePreset(p); presets.push(p); } catch (e) { issues.push(`${id}: ${e.message}`); }
  }
  if (decisions.default_preset && !presets.some(p => p.id === decisions.default_preset)) issues.push(`Unknown chosen default ${decisions.default_preset}`);
  return { source: file, source_hash: hash(legacy), presets, default_preset: decisions.default_preset || null,
    files: presets.map(p => path.join(root, 'presets', `${p.id}.json`)), issues,
    note: 'Dry-run does not call models or modify files. No default is inferred from a family name.' };
}
export function migrate(decisions = {}, apply = false, root = home()) {
  const plan = migrationPlan(decisions, root);
  if (!apply) return plan;
  check(!plan.issues.length, `Migration requires decisions: ${plan.issues.join('; ')}`);
  return locked(path.join(root, 'config.lock'), () => {
    const journal = readJSON(path.join(root, 'migration-v2.json'), null);
    if (journal) {
      check(journal.source_hash === plan.source_hash, 'Legacy config changed since migration; reconcile it explicitly');
      return { ...journal, already_migrated: true, note: 'Existing v2 edits preserved' };
    }
    const existing = presetFiles(root).map(f => f.toLowerCase());
    for (const p of plan.presets) check(!existing.includes(`${p.id}.json`.toLowerCase()), `Migration would overwrite ${p.id}; choose a different destination`);
    const legacy = readConfig(plan.source); check(hash(legacy) === plan.source_hash, 'Legacy config changed during migration');
    if (plan.default_preset) check(!fs.existsSync(path.join(root, 'settings.json')), 'Settings already exist; set the default explicitly after migration');
    const backup = path.join(root, `config.v1-${plan.source_hash.slice(0, 12)}.json`);
    if (!fs.existsSync(backup)) atomicJSON(backup, legacy);
    const created = [];
    try {
      for (const p of plan.presets) { const file = path.join(root, 'presets', `${p.id}.json`); atomicJSON(file, p); created.push(file); }
      if (plan.default_preset) { const file = path.join(root, 'settings.json'); atomicJSON(file, { schema_version: 2, default_preset: plan.default_preset }); created.push(file); }
      const result = { source_hash: plan.source_hash, files: plan.files, backup, default_preset: plan.default_preset };
      atomicJSON(path.join(root, 'migration-v2.json'), result); return result;
    } catch (error) { for (const file of created) fs.rmSync(file, { force: true }); throw error; }
  });
}
