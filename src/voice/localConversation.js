import { GEV_ACTION_SCHEMAS } from './actionSchemas.js';

const actions = new Set(GEV_ACTION_SCHEMAS.map((schema) => schema.name));

export async function localJson(path, body, signal, fetchImpl = fetch) {
  const response = await fetchImpl(`/api/local-ai/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
    cache: 'no-store',
    redirect: 'error',
  });
  const data = await response.json();
  signal?.throwIfAborted();
  if (!response.ok)
    throw new Error(data.error || `Local AI: HTTP ${response.status}`);
  return data;
}

/** Keep complete user turns together so tool results never lose their calls. */
export function trimLocalHistory(messages, maxChars = 18000) {
  const history = [...messages];
  while (
    history.length > 1 &&
    (JSON.stringify(history).length > maxChars || history.length > 32)
  ) {
    const nextTurn = history.findIndex(
      (message, index) => index > 0 && message.role === 'user',
    );
    if (nextTurn < 0) break;
    history.splice(0, nextTurn);
  }
  return history;
}

export async function runLocalTurn({
  text,
  history = [],
  runAction,
  signal,
  request = localJson,
  emit = () => {},
}) {
  const messages = trimLocalHistory([
    ...history,
    { role: 'user', content: text.slice(0, 4000) },
  ]);
  signal?.throwIfAborted();
  emit({ type: 'transcript', role: 'user', text, final: true });
  for (let round = 0; round < 6; round++) {
    const { message } = await request('chat', { messages }, signal);
    signal?.throwIfAborted();
    if (
      !message ||
      (message.content != null && typeof message.content !== 'string')
    )
      throw new Error('Invalid local model response');
    const calls = message.tool_calls || [];
    if (!Array.isArray(calls) || calls.length > 4)
      throw new Error('Too many local tool calls');
    if (!calls.length) {
      const reply = (message.content || '')
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .trim();
      if (!reply) throw new Error('Local model returned an empty answer');
      messages.push({ role: 'assistant', content: reply });
      emit({ type: 'transcript', role: 'assistant', text: reply, final: true });
      return { text: reply, history: trimLocalHistory(messages) };
    }
    const ids = new Set();
    for (const call of calls) {
      if (
        typeof call.id !== 'string' ||
        !call.id ||
        ids.has(call.id) ||
        call.type !== 'function'
      )
        throw new Error('Invalid local tool call');
      ids.add(call.id);
    }
    messages.push({
      role: 'assistant',
      content: message.content || null,
      tool_calls: calls,
    });
    for (const call of calls) {
      signal?.throwIfAborted();
      const name = call.function?.name;
      let result;
      try {
        const args = JSON.parse(call.function.arguments);
        if (!args || typeof args !== 'object' || Array.isArray(args))
          throw new Error('Tool arguments must be an object');
        if (name === 'web_search')
          result = await request('search', args, signal);
        else if (actions.has(name))
          result = await runAction(name, args, { signal });
        else throw new Error('Unknown map action');
      } catch (error) {
        signal?.throwIfAborted();
        result = { error: error.message };
      }
      signal?.throwIfAborted();
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result ?? null).slice(0, 8000),
      });
    }
  }
  throw new Error(
    'Local model reached the action limit; try a simpler command',
  );
}
