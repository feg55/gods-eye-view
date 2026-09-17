import { checkLocalGpu, requireCachedModels } from './localModelCache.js';
import { localAiConfig } from './localConfig.js';

/** One worker owns the model sessions. Termination also cancels GPU/WASM work. */
export function createBrowserLocalRuntime(selection) {
  const config = {
    ...localAiConfig({
      LOCAL_AI_PROFILE: selection.profile,
      LOCAL_AI_LANGUAGE: selection.language,
    }),
    ...selection,
  };
  let worker,
    serial = 0;
  const pending = new Map();
  function stop(
    reason = new DOMException('Local inference stopped', 'AbortError'),
  ) {
    worker?.terminate();
    worker = null;
    for (const item of pending.values()) {
      item.cleanup();
      item.reject(reason);
    }
    pending.clear();
  }
  function request(type, data, signal, onStatus) {
    signal?.throwIfAborted();
    if (!worker) {
      worker = new Worker(new URL('./browserLocalWorker.js', import.meta.url), {
        type: 'module',
        name: 'gev-local-ai',
      });
      worker.onerror = (event) =>
        stop(new Error(event.message || 'Local model worker failed'));
      worker.onmessage = ({ data: reply }) => {
        const item = pending.get(reply.id);
        if (!item) return;
        if (reply.status) {
          item.onStatus?.(reply.status);
          return;
        }
        pending.delete(reply.id);
        item.cleanup();
        if (reply.error) item.reject(new Error(reply.error));
        else item.resolve(reply.result);
      };
    }
    return new Promise((resolve, reject) => {
      const id = ++serial;
      const abort = () => stop(signal.reason);
      const cleanup = () => signal?.removeEventListener('abort', abort);
      pending.set(id, { resolve, reject, cleanup, onStatus });
      signal?.addEventListener('abort', abort, { once: true });
      worker.postMessage(
        { id, type, data, config },
        data?.audio ? [data.audio.buffer] : [],
      );
    });
  }
  return {
    async prepare(signal, onStatus) {
      await checkLocalGpu();
      await requireCachedModels(config);
      signal?.throwIfAborted();
      await request('prepare', null, signal, onStatus);
    },
    chat: (messages, signal) => request('chat', { messages }, signal),
    transcribe: (audio, signal) => request('transcribe', { audio }, signal),
    speech: (text, signal) => request('speech', { text }, signal),
    stop,
  };
}
