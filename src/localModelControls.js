import {
  formatModelBytes,
  selectedLocalModels,
} from './voice/localModelCache.js';
import {
  cancelLocalDownload,
  deleteLocalDownload,
  localDownloadState,
  refreshLocalDownload,
  startLocalDownload,
  subscribeLocalDownloads,
} from './voice/localDownloads.js';

export function createLocalModelControls(documentRef) {
  const root = documentRef.createElement('div');
  root.className = 'local-models';
  let cards = [];
  const paint = () => {
    for (const { model, card, progress, status, download, remove } of cards) {
      const state = localDownloadState(model);
      const busy = state.status === 'downloading';
      const ready = state.status === 'ready';
      const failed = state.status === 'error';
      const checking = state.status === 'checking';
      card.dataset.state = state.status;
      progress.hidden = !busy;
      progress.max = state.total;
      progress.value = state.loaded;
      download.textContent = busy
        ? 'CANCEL'
        : ready
          ? 'DOWNLOADED ✓'
          : failed
            ? 'RETRY DOWNLOAD'
            : 'DOWNLOAD';
      download.disabled = ready || checking;
      remove.hidden = busy || (!ready && !state.loaded);
      status.textContent = busy
        ? `${Math.min(100, Math.floor((state.loaded / state.total) * 100))}% · ${formatModelBytes(state.loaded)} / ${formatModelBytes(state.total)}`
        : state.error ||
          (ready
            ? 'Saved in this browser'
            : checking
              ? 'Checking browser cache…'
              : `${formatModelBytes(state.total)}${state.loaded ? ' · partially downloaded' : ''}`);
    }
  };
  const unsubscribe = subscribeLocalDownloads(paint);
  return {
    root,
    destroy: unsubscribe,
    select(config) {
      cards = [];
      root.textContent = '';
      for (const model of selectedLocalModels(config)) {
        const card = documentRef.createElement('div');
        card.className = 'local-model';
        card.dataset.localModel = model.id;
        const title = documentRef.createElement('strong');
        title.textContent = model.title;
        const kind = documentRef.createElement('span');
        kind.className = 'local-model-kind';
        kind.textContent = {
          chat: 'AI MODEL',
          recognition: 'SPEECH RECOGNITION',
          speech: 'VOICE',
        }[model.kind];
        const status = documentRef.createElement('span');
        status.className = 'local-model-status';
        status.setAttribute('role', 'status');
        const progress = documentRef.createElement('progress');
        progress.setAttribute('aria-label', `${model.title} download progress`);
        const actions = documentRef.createElement('div');
        actions.className = 'local-model-actions';
        const download = documentRef.createElement('button');
        download.type = 'button';
        download.className = 'local-model-download';
        download.setAttribute('aria-label', `Download ${model.title}`);
        download.addEventListener('click', () => {
          if (localDownloadState(model).status === 'downloading')
            cancelLocalDownload(model);
          else void startLocalDownload(model);
        });
        const remove = documentRef.createElement('button');
        remove.type = 'button';
        remove.className = 'key-setup-remove';
        remove.textContent = 'REMOVE FROM CACHE';
        remove.setAttribute(
          'aria-label',
          `Remove ${model.title} from browser cache`,
        );
        remove.addEventListener('click', () => void deleteLocalDownload(model));
        actions.append(download, remove);
        card.append(kind, title, status, progress, actions);
        root.append(card);
        cards.push({ model, card, status, progress, download, remove });
        void refreshLocalDownload(model);
      }
      paint();
    },
  };
}
