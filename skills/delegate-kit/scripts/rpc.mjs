import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'node:url';
import { sumMeasurements } from './adapters.mjs';
import { check } from './presets.mjs';
import { installedPiSDK } from './pi-worker.mjs';

// LF alone delimits records, including when a chunk splits a UTF-8 character.
export class FrameDecoder {
  constructor(kind, emit) { this.kind = kind; this.emit = emit; this.buffer = Buffer.alloc(0); this.chunk = null; this.maxFrame = kind === 'omp' ? 1048576 : 67108864; this.maxTotal = 67108864; this.v2 = false; }
  push(bytes) {
    this.buffer = Buffer.concat([this.buffer, bytes]);
    let end;
    while ((end = this.buffer.indexOf(10)) !== -1) {
      check(end <= this.maxFrame, 'RPC physical frame exceeds limit');
      const line = this.buffer.subarray(0, end); this.buffer = this.buffer.subarray(end + 1);
      if (!line.length) continue;
      this.frame(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line)));
    }
    check(this.buffer.length <= this.maxFrame, 'RPC unterminated frame exceeds limit');
  }
  frame(frame) {
    check(frame && typeof frame.type === 'string', 'RPC frame needs a type');
    if (frame.type !== 'rpc_chunk') {
      check(!this.chunk, 'RPC chunk sequence interrupted');
      this.emit(frame); return;
    }
    check(this.kind === 'omp' && this.v2, 'RPC chunks require negotiated OMP v2');
    const { chunkId, index, count, byteLength, data } = frame;
    check(typeof chunkId === 'string' && chunkId.length && Number.isSafeInteger(index) && index >= 0 && Number.isSafeInteger(count) && count > 0 && count <= this.maxTotal && index < count && Number.isSafeInteger(byteLength) && byteLength > 0 && byteLength <= this.maxTotal, 'Invalid RPC chunk metadata');
    check(typeof data === 'string' && data.length > 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data), 'Invalid RPC base64');
    this.chunk ||= { chunkId, count, byteLength, next: 0, bytes: 0, parts: [] };
    const c = this.chunk;
    check(c.chunkId === chunkId && c.count === count && c.byteLength === byteLength && c.next === index, 'RPC chunks out of order or interleaved');
    const part = Buffer.from(data, 'base64'); c.parts.push(part); c.bytes += part.length; c.next++;
    check(c.bytes <= byteLength, 'RPC chunk byte length exceeded');
    if (c.next === count) {
      check(c.bytes === byteLength, 'RPC chunk byte length mismatch');
      const complete = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(c.parts)));
      check(complete.type !== 'rpc_chunk', 'Nested RPC chunks are unsupported');
      this.chunk = null; this.frame(complete);
    }
  }
  end() { check(this.buffer.length === 0 && !this.chunk, 'Incomplete RPC frame at EOF'); }
}

export function rpcCommand(executor, dir, resumeFile) {
  const omp = executor.harness === 'omp';
  const shell = omp && executor.access === 'workspace-write' && executor.permissions?.shell === true;
  const args = ['--mode', 'rpc', '--provider', executor.provider, '--model', executor.model,
    '--no-extensions', '--no-skills', '--tools', executor.access === 'workspace-write'
      ? (omp ? `read,grep,glob,edit,write${shell ? ',bash' : ''}` : 'read,grep,find,ls,edit,write')
      : (omp ? 'read,grep,glob' : 'read,grep,find,ls'), '--session-dir', dir];
  if (executor.reasoning !== undefined) args.push('--thinking', executor.reasoning);
  if (resumeFile) args.push(omp ? '--resume' : '--session', resumeFile);
  if (omp) args.push('--no-title', '--no-prewalk', '--config', `${dir}/runtime-config.json`, '--approval-mode', 'write');
  return omp ? { cmd: 'omp', args } : { cmd: process.execPath, args: [fileURLToPath(new URL('./pi-worker.mjs', import.meta.url)), '--sdk', installedPiSDK(), ...args] };
}
export const ompConfig = {
  advisor: { enabled: false },
  retry: { enabled: false, modelFallback: false, usageAwareFallback: false },
  providers: { anthropic: { serverSideFallback: false } },
  compaction: { enabled: false, asyncEnabled: false, idleEnabled: false },
  memory: { backend: 'off' }, autolearn: { enabled: false, autoContinue: false }, recap: { enabled: false }, contextPromotion: { enabled: false },
  plan: { enabled: false, defaultOnStartup: false }, todo: { enabled: false },
  task: { isolation: { enabled: false }, eager: false },
};

// Own one prompt per RPC process. Responses are correlation-checked; prompt ACK
// does not settle the turn. The caller owns process termination and durable state.
export function rpcTurn(child, executor, prompt, onState, onLog, timeoutMs = 30000, onUsage = () => {}) {
  const messages = [];
  let turnMessages = null;
  const pending = new Map(); let serial = 0, settled = false, prompted = false, last = null, failure = null;
  let resolveDone, rejectDone, readyResolve;
  const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  const ready = new Promise(resolve => { readyResolve = resolve; });
  function fail(error) {
    if (failure) return;
    failure = error;
    for (const req of pending.values()) { clearTimeout(req.timer); req.reject(error); }
    pending.clear();
    if (!settled) { settled = true; rejectDone(error); }
  }
  function send(type, data = {}) {
    return new Promise((resolve, reject) => {
      if (failure) { reject(failure); return; }
      const id = `dk-${++serial}`;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC ${type} acknowledgement timed out`)); }, timeoutMs);
      pending.set(id, { type, resolve, reject, timer });
      child.stdin.write(JSON.stringify({ id, type, ...data }) + '\n', error => { if (error) fail(error); });
    });
  }
  const decoder = new FrameDecoder(executor.harness, frame => {
    if (frame.type === 'ready') {
      check(executor.harness === 'omp' && frame.protocolVersion === 1 && frame.supportedProtocolVersions?.includes(2), 'OMP requires protocol v2 support');
      check(Number.isSafeInteger(frame.maxFrameBytes) && frame.maxFrameBytes > 0 && Number.isSafeInteger(frame.maxReassembledFrameBytes) && frame.maxReassembledFrameBytes > 0, 'Invalid OMP ready limits');
      decoder.maxFrame = Math.min(frame.maxFrameBytes, 1048576); decoder.maxTotal = Math.min(frame.maxReassembledFrameBytes, 67108864);
      readyResolve(); return;
    }
    if (frame.type === 'response') {
      const req = pending.get(frame.id);
      if (!req) { if (frame.success === false) throw new Error(`RPC ${frame.command || 'parse'} failed`); return; }
      check(frame.command === req.type, 'RPC response command does not match request');
      clearTimeout(req.timer); pending.delete(frame.id);
      if (frame.success !== true) { req.reject(new Error(`RPC ${req.type} failed; inspect the private log`)); return; }
      if (req.type === 'negotiate_protocol') decoder.v2 = true;
      req.resolve(frame.data); return;
    }
    if (['extension_error', 'error', 'retry_fallback_applied', 'auto_retry_start', 'auto_compaction_start', 'subagent_lifecycle', 'host_tool_call', 'host_uri_request'].includes(frame.type)) throw new Error(`Unexpected RPC event ${frame.type}; execution stopped without fallback`);
    if (frame.type === 'extension_ui_request' && !['notify', 'setStatus', 'setWidget', 'setTitle', 'set_editor_text'].includes(frame.method)) throw new Error('RPC needs interactive permission; resume after resolving it explicitly');
    if (frame.type === 'message_end' && frame.message?.role === 'assistant') { last = frame.message; messages.push(last); }
    if (frame.type === 'prompt_result' && frame.agentInvoked === false) throw new Error('RPC prompt did not invoke an agent');
    if (frame.type === 'agent_end' && frame.isTerminal !== false && prompted && !settled) {
      turnMessages = frame.messages?.filter(m => m.role === 'assistant');
      if (!turnMessages?.length) turnMessages = messages;
      last = turnMessages.at(-1) || last;
      settled = true;
      resolveDone(last);
    }
  });
  child.stdout.on('data', bytes => { onLog(bytes); try { decoder.push(bytes); } catch (error) { fail(error); } });
  child.stdin.on('error', fail);
  child.on('error', fail);
  child.on('close', () => { try { decoder.end(); } catch (e) { fail(e); } if (!settled || pending.size) fail(new Error('RPC closed before completing the turn and pending responses')); });
  // Attach a rejection handler immediately while the handshake awaits responses.
  done.catch(() => {});
  return (async () => {
    try {
      if (executor.harness === 'omp') {
        let timer;
        try { await Promise.race([ready, done, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('OMP ready timed out')), timeoutMs); })]); }
        finally { clearTimeout(timer); }
        await send('negotiate_protocol', { protocolVersion: 2 });
      }
      const selected = await send('set_model', { provider: executor.provider, modelId: executor.model });
      check(selected?.id === executor.model && selected?.provider === executor.provider, 'RPC did not select the exact model/provider');
      await send('set_auto_retry', { enabled: false });
      await send('set_auto_compaction', { enabled: false });
      if (executor.reasoning !== undefined) await send('set_thinking_level', { level: executor.reasoning });
      const state = await send('get_state');
      check(state?.model?.id === executor.model && state?.model?.provider === executor.provider, 'RPC state model/provider mismatch');
      check(executor.reasoning === undefined || state.thinkingLevel === executor.reasoning, 'RPC reasoning was clamped or ignored');
      onState(state);
      prompted = true;
      const accepted = await send('prompt', { message: prompt });
      check(accepted?.agentInvoked !== false, 'RPC prompt did not invoke an agent');
      const message = await done;
      check(message && !['error', 'aborted'].includes(message.stopReason), 'RPC assistant failed or aborted');
      const finalState = await send('get_state'); onState(finalState);
      if (failure) throw failure;
      check(finalState.sessionId && finalState.sessionFile, 'RPC did not return a resumable session');
      check(finalState.model?.id === executor.model && finalState.model?.provider === executor.provider, 'RPC changed the selected executor during the turn');
      check(!message.model || message.model === executor.model, 'RPC message came from a different model');
      check(!message.provider || message.provider === executor.provider, 'RPC message came from a different provider');
      return { text: (message.content || []).filter(p => p.type === 'text').map(p => p.text).join(''),
        usage: sumUsage(turnMessages), actual_model: message.model || null, actual_provider: message.provider || null,
        assertHealthy: () => { if (failure) throw failure; } };
    } finally {
      for (const p of pending.values()) clearTimeout(p.timer); pending.clear();
      onUsage(sumUsage(turnMessages || messages));
    }
  })();
}

// agent_end contains the current turn's messages, also emitted by message_end.
// Aggregate one source only; any missing component stays unknown.
export function sumUsage(messages) {
  const unique = new Map();
  for (const message of messages || []) {
    // Provider response IDs identify replies; equal token counts do not.
    const id = message.id || message.responseId;
    const key = id ? JSON.stringify([message.provider, message.model, id]) : Symbol();
    unique.set(key, message);
  }
  return sumMeasurements([...unique.values()].map(message => message.usage));
}
