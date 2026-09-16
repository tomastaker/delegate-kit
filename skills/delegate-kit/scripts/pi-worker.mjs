// Use the SDK shipped with the selected Pi installation solely to provide an
// in-memory settings store to its official RPC mode. Credentials/models stay at
// their original Pi paths; no package is downloaded and no auth data is copied.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { check, readJSON } from './presets.mjs';

export function installedPiSDK() {
  const located = spawnSync('which', ['pi'], { encoding: 'utf8' });
  check(located.status === 0, 'Pi CLI is not installed');
  let dir = path.dirname(fs.realpathSync(located.stdout.trim()));
  for (;;) {
    const pkg = readJSON(path.join(dir, 'package.json'), null);
    if (pkg?.name === '@earendil-works/pi-coding-agent') {
      const main = pkg.exports?.['.']?.import || pkg.main;
      check(typeof main === 'string' && fs.existsSync(path.resolve(dir, main)), 'Installed Pi package has no supported SDK entry');
      return path.resolve(dir, main);
    }
    const parent = path.dirname(dir); if (parent === dir) break; dir = parent;
  }
  throw new Error('Cannot locate the SDK shipped with Pi; supported package is @earendil-works/pi-coding-agent. No model was called.');
}

export async function piWorker(args) {
  const value = key => { const index = args.indexOf(key); return index < 0 ? undefined : args[index + 1]; };
  const sdk = await import(pathToFileURL(value('--sdk')).href);
  for (const name of ['SettingsManager', 'SessionManager', 'getAgentDir', 'createAgentSessionServices', 'createAgentSessionFromServices', 'createAgentSessionRuntime', 'runRpcMode']) check(sdk[name], `Installed Pi SDK lacks ${name}; verify its version before dispatch`);
  const agentDir = sdk.getAgentDir();
  const saved = readJSON(path.join(agentDir, 'settings.json'), {});
  const settingsManager = sdk.SettingsManager.inMemory({ ...saved,
    packages: [], extensions: [], skills: [], prompts: [], themes: [], defaultProjectTrust: 'never',
    retry: { ...saved.retry, enabled: false }, compaction: { ...saved.compaction, enabled: false },
  });
  const cwd = process.cwd(), sessionDir = value('--session-dir'), resumeFile = value('--session');
  const sessionManager = resumeFile ? sdk.SessionManager.open(resumeFile) : sdk.SessionManager.create(cwd, sessionDir);
  const factory = async ({ cwd: currentCwd, sessionManager: currentSession, sessionStartEvent }) => {
    const services = await sdk.createAgentSessionServices({ cwd: currentCwd, agentDir, settingsManager,
      resourceLoaderOptions: { noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true } });
    const model = services.modelRuntime.getAvailableSnapshot().find(m => m.id === value('--model') && m.provider === value('--provider'));
    check(model, 'Pi configured catalog does not contain the exact requested provider/model');
    const result = await sdk.createAgentSessionFromServices({ services, sessionManager: currentSession, sessionStartEvent,
      model, ...(value('--thinking') === undefined ? {} : { thinkingLevel: value('--thinking') }), tools: value('--tools').split(',') });
    check(!result.modelFallbackMessage, 'Pi attempted an initial model fallback');
    return { ...result, services, diagnostics: services.diagnostics };
  };
  const runtime = await sdk.createAgentSessionRuntime(factory, { cwd, agentDir, sessionManager });
  await sdk.runRpcMode(runtime);
}
if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  piWorker(process.argv.slice(2)).catch(error => {
    console.error(/^(Installed Pi SDK lacks |Pi configured catalog |Pi attempted an initial model fallback)/.test(error.message)
      ? error.message : 'Pi SDK startup failed; verify installed SDK capabilities, model access and private configuration.');
    process.exitCode = 1;
  });
}
