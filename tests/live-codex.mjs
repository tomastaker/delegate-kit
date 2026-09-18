import { randomUUID } from 'node:crypto';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawnSync } from 'node:child_process'; import assert from 'node:assert/strict';
import {savePreset,setDefault,context} from '../skills/delegate-kit/scripts/presets.mjs';
import {prepare,launch,wait,resume,cancel,getRun} from '../skills/delegate-kit/scripts/runtime.mjs';
import {openTask,checkTask,acceptTask} from '../skills/delegate-kit/scripts/tasks.mjs';
// Explicit opt-in: this script calls the user's configured Codex provider.
const options = process.argv.slice(2);
if (!options.includes('--execute')) {
  console.log('Live Codex smoke (up to four dispatches): --execute --writer-model MODEL --reviewer-model MODEL. Uses low reasoning and a temporary repository; preserves artifacts. Not part of CI.');
  process.exit(0);
}
function option(name) { const i = options.indexOf(name); assert.ok(i >= 0 && options[i + 1] && !options[i + 1].startsWith('--'), `Missing ${name}`); return options[i + 1]; }
const writerModel = option('--writer-model'), reviewerModel = option('--reviewer-model');
const marker = `DK-MEMORY-${randomUUID()}`;
const root=fs.mkdtempSync(path.join(os.tmpdir(),'dk-live-sol-luna-')); process.env.DELEGATE_KIT_HOME=path.join(root,'state');
const repo=path.join(root,'repo'),wt=path.join(root,'worker'); fs.mkdirSync(repo);
const git=(args)=>{const r=spawnSync('git',args,{cwd:repo,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout};
git(['init','-q']); fs.writeFileSync(path.join(repo,'take.mjs'),'export function takeFirst(items, count) { return items.slice(0, Math.max(0, count) + 1); }\n');
fs.writeFileSync(path.join(repo,'take.test.mjs'),"import {test} from 'node:test'; import assert from 'node:assert/strict'; import {takeFirst} from './take.mjs'; test('two',()=>assert.deepEqual(takeFirst([1,2,3],2),[1,2])); test('zero',()=>assert.deepEqual(takeFirst([1,2,3],0),[]));\n");
git(['add','.']);git(['-c','user.name=DK Test','-c','user.email=test@example.invalid','commit','-qm','Initial test fixture']);git(['worktree','add','-qb','codex/live-worker',wt]);
const models={sol:writerModel,luna:reviewerModel};
savePreset({schema_version:2,id:'LIVE',limits:{max_runs:4,max_retries:1},agents:{sol:{role:'implementer',when:'Fix the small fixture',executor:{harness:'codex',model:models.sol,reasoning:'low',transport:'cli'}},luna:{role:'reviewer',when:'Independent review',executor:{harness:'codex',model:models.luna,reasoning:'low',transport:'cli'}}}});setDefault('LIVE');context({session:'codex:live-smoke'});
const started=[];
const reports=[]; const file=(name,body)=>{const f=path.join(root,name);fs.writeFileSync(f,body);return f};
const brief=file('fix.md',`This is an isolated smoke test. Fix the off-by-one in take.mjs: takeFirst(items,count) must return the first max(0,count) items. Read only these two small files, edit only take.mjs, run node --test take.test.mjs, no commits, network or delegation. Keep response short. Remember the marker ${marker} for a later continuation.`);
openTask({session:'codex:live-smoke',task:'smoke',repo, specification:{path:brief,goal:'Fix takeFirst',requirements:[{id:'take',text:'Return the first max(0,count) items'}]},
 work_items:[{id:'fix',profile:'sol',routing:{defined:true,risk:'ordinary',reason:'Small fixture with assertions'},scope:{include:['take.mjs']},checks:['take']}],
 checks:[{id:'take',requirements:['take'],argv:[process.execPath,'--test','take.test.mjs']}],review:{profiles:['luna']}});
console.log(JSON.stringify({root,models}));
async function collect(id){for(let n=0;n<8;n++){const r=await wait(id,30000);if(['finished','failed','cancelled','timeout','blocked'].includes(r.status))return r;if(r.health?.attention_required)throw new Error(JSON.stringify(r.health));}throw new Error('Smoke observation deadline');}
try {
 const first=prepare({session:'codex:live-smoke',task:'smoke',workItem:'fix',agent:'sol',brief,cwd:wt,timeoutMs:240000}).runs[0];started.push(first.id);launch(first.id);const short=await wait(first.id,10);assert.equal(short.wait_timed_out,true);
 const done=await collect(first.id);reports.push({case:'sol-fix',...done});console.log(JSON.stringify({case:'sol-fix',status:done.status,error:done.error,id:done.id,usage:done.usage}));assert.equal(done.status,'finished',done.error);
 const checked=spawnSync(process.execPath,['--test','take.test.mjs'],{cwd:wt,encoding:'utf8'});assert.equal(checked.status,0,checked.stdout+checked.stderr);assert.equal(done.result_validated,true);
 const n=resume(first.id,file('resume.md','Do not use tools or edit files. In summary briefly state what you changed previously and echo the exact remembered marker from the original request. Return the required result object.'));started.push(n.id);launch(n.id);const followed=await collect(n.id);reports.push({case:'sol-resume',...followed});console.log(JSON.stringify({case:'sol-resume',status:followed.status,id:followed.id,usage:followed.usage}));assert.equal(followed.status,'finished',followed.error);assert.equal(followed.transport_session_id,done.transport_session_id);assert.ok(followed.result.summary.includes(marker), 'Continuation lost the original marker');
 const checkpoint=checkTask('codex:live-smoke','smoke',wt).current_checkpoint;
 const beforeReview = fs.readFileSync(path.join(wt, 'take.mjs'), 'utf8');
 const review=prepare({session:'codex:live-smoke',task:'smoke',checkpoint,agent:'luna',brief:file('review.md','Independent read-only review of take.mjs and take.test.mjs in this isolated fixture. Contract: takeFirst(items,count) returns the first max(0,count) items for integer count. Read the files and verify tests with node --test take.test.mjs. Report only concrete defects; if none, say so. Do not edit files, use network, delegate or inspect unrelated files. Keep response short.'),cwd:wt,timeoutMs:240000}).runs[0];started.push(review.id);launch(review.id);const reviewed=await collect(review.id);reports.push({case:'luna-review',...reviewed});console.log(JSON.stringify({case:'luna-review',status:reviewed.status,id:reviewed.id,usage:reviewed.usage}));assert.equal(reviewed.status,'finished',reviewed.error);assert.notEqual(reviewed.transport_session_id, followed.transport_session_id);assert.equal(reviewed.result.findings.length,0);assert.equal(fs.readFileSync(path.join(wt,'take.mjs'),'utf8'),beforeReview);
 assert.equal(acceptTask('codex:live-smoke','smoke',checkTask('codex:live-smoke','smoke',wt).revision,checkpoint).status,'verified');
 const abort=prepare({session:'codex:live-smoke',task:'smoke',checkpoint,agent:'luna',brief:file('cancel.md','Cancellation smoke test. Run sleep 30, then return a short done result. No edits, network, delegation or other work.'),cwd:wt,timeoutMs:60000}).runs[0];started.push(abort.id);launch(abort.id);
 for(let i=0;i<100 && !getRun(abort.id).child_pid;i++)await new Promise(r=>setTimeout(r,50));
 assert.ok(getRun(abort.id).child_pid);const stopped=await cancel(abort.id);reports.push({case:'luna-cancel',...stopped});assert.equal(stopped.status,'cancelled');console.log(JSON.stringify({case:'luna-cancel',status:stopped.status,id:stopped.id}));
 fs.writeFileSync(path.join(root,'report.json'),JSON.stringify({root,success:true,reports},null,2));
} catch(error){
 for (const id of started) { try { await cancel(id); } catch {} }
fs.writeFileSync(path.join(root,'report.json'),JSON.stringify({root,success:false,error:error.message,reports},null,2)); console.error(error);process.exitCode=1;}
