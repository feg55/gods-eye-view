import catalog from './localModels.json' with { type: 'json' };

export const MODEL_CACHE = 'gev-local-models-v1';
export const LOCAL_MODELS = Object.freeze(catalog);

export function selectedLocalModels({
  profile = 'balance',
  language = 'ru',
} = {}) {
  const models = [
    catalog[`bonsai-${profile}`],
    catalog[`whisper-${profile}`],
    catalog[`piper-${language}`],
  ];
  if (models.some((model) => !model))
    throw new Error('Unknown local model selection');
  return models;
}

export const modelBytes = (model) =>
  model.files.reduce((sum, file) => sum + file.size, 0);
export const formatModelBytes = (bytes) =>
  bytes >= 1e9
    ? `${(bytes / 1e9).toFixed(2)} GB`
    : `${Math.ceil(bytes / 1e6)} MB`;

export async function openModelCache() {
  if (!globalThis.caches)
    throw new Error(
      'Model storage requires localhost or HTTPS and browser storage enabled.',
    );
  return caches.open(MODEL_CACHE);
}

/** Transformers.js probes tokenizer metadata at "main" even when a revision is supplied. */
export function modelCacheReader(cache, models) {
  const urls = new Map();
  for (const model of models)
    for (const file of model.files) {
      urls.set(file.url, file.url);
      urls.set(
        file.url.replace(`/resolve/${model.revision}/`, '/resolve/main/'),
        file.url,
      );
    }
  return {
    async match(request) {
      const url = urls.get(
        typeof request === 'string' ? request : request.url || String(request),
      );
      return url ? cache.match(url) : undefined;
    },
    async put() {
      throw new Error(
        'Download models using the buttons in Provider Settings.',
      );
    },
  };
}

/** The cache is authoritative; a localStorage flag cannot prove a download survived eviction. */
export async function cachedModelBytes(model, cache) {
  cache ||= await openModelCache();
  let loaded = 0;
  for (const file of model.files) {
    const response = await cache.match(file.url);
    if (response?.headers.get('X-GEV-Model-Size') === String(file.size))
      loaded += file.size;
  }
  return loaded;
}

/** Stream directly into Cache Storage, without buffering multi-GB weights in the UI. */
export async function downloadModel(
  model,
  { signal, onProgress = () => {}, cache, fetchImpl = fetch } = {},
) {
  cache ||= await openModelCache();
  const total = modelBytes(model);
  let loaded = await cachedModelBytes(model, cache);
  const estimate = await globalThis.navigator?.storage?.estimate?.();
  if (estimate?.quota && estimate.quota - estimate.usage < total - loaded)
    throw new Error(
      `Not enough browser storage. Free at least ${formatModelBytes(total - loaded)} and retry.`,
    );
  onProgress({ loaded, total });
  for (const file of model.files) {
    signal?.throwIfAborted();
    if (
      (await cache.match(file.url))?.headers.get('X-GEV-Model-Size') ===
      String(file.size)
    )
      continue;
    const response = await fetchImpl(file.url, {
      signal,
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!response.ok || !response.body)
      throw new Error(
        `Download failed (HTTP ${response.status}). Retry to keep completed files.`,
      );
    let received = 0;
    const stream = response.body.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          signal?.throwIfAborted();
          received += chunk.byteLength;
          if (received > file.size)
            throw new Error('Unexpected model file size');
          onProgress({ loaded: loaded + received, total });
          controller.enqueue(chunk);
        },
        flush() {
          if (received !== file.size)
            throw new Error('Download incomplete. Retry to continue.');
        },
      }),
      { signal },
    );
    try {
      await cache.put(
        file.url,
        new Response(stream, {
          headers: {
            'Content-Type':
              response.headers.get('Content-Type') ||
              'application/octet-stream',
            'Content-Length': String(file.size),
            'X-GEV-Model-Size': String(file.size),
          },
        }),
      );
    } catch (error) {
      await cache.delete(file.url);
      if (error.name === 'QuotaExceededError')
        throw new Error(
          'Browser storage is full. Remove a cached model and retry.',
        );
      throw error;
    }
    loaded += file.size;
  }
  signal?.throwIfAborted();
  onProgress({ loaded: total, total });
}

export async function removeCachedModel(model) {
  const cache = await openModelCache();
  for (const file of model.files) await cache.delete(file.url);
}

export async function requireCachedModels(config) {
  const cache = await openModelCache();
  for (const model of selectedLocalModels(config)) {
    if ((await cachedModelBytes(model, cache)) !== modelBytes(model))
      throw new Error(
        `Download ${model.title} in POWER UP → AI ASSISTANT first.`,
      );
  }
}

export async function checkLocalGpu() {
  const adapter = await globalThis.navigator?.gpu?.requestAdapter({
    powerPreference: 'high-performance',
  });
  if (!adapter)
    throw new Error(
      'WebGPU is unavailable. Open in Chrome or Edge with hardware acceleration enabled.',
    );
  if (!adapter.features.has('shader-f16'))
    throw new Error(
      'This GPU does not support the 16-bit shaders required by Bonsai.',
    );
}
