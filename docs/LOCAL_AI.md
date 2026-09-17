# Local AI in the browser

Open **POWER UP ? AI ASSISTANT ? Local**, choose **low / balance / max** and a voice language. Click **DOWNLOAD** on the AI model, speech recognition and voice cards. Wait for **DOWNLOADED**, then **SAVE SETTINGS**. Activate the microphone or hold Space to speak.

No API key, Python installation, llama-server or separate speech service is required.

| Profile | AI model            | Download | Speech recognition | Download |
| ------- | ------------------- | -------- | ------------------ | -------- |
| low     | Ternary Bonsai 1.7B | 480 MB   | Whisper tiny       | 46 MB    |
| balance | Ternary Bonsai 4B   | 1.10 GB  | Whisper base       | 82 MB    |
| max     | Ternary Bonsai 8B   | 2.22 GB  | Whisper small      | 254 MB   |

Piper Irina (Russian) or Lessac (English) adds about 64 MB. The app also serves the WASM runtime and phonemizer assets locally. Download sizes are not GPU memory requirements: model initialization, context and the globe need additional memory. Start with **low** on smaller GPUs.

Use a current Chrome or Edge browser with hardware acceleration and WebGPU with shader-f16. The app must run on localhost or HTTPS. Inference executes in a worker: Bonsai uses WebGPU, Whisper and Piper use WASM. Microphone audio and generated speech remain in the browser. Local mode has no cloud fallback and no image input.

Downloads are streamed into **Cache Storage** for this site's origin. Closing settings does not stop them. **CANCEL** aborts the current file; completed files are reused on retry. **REMOVE FROM CACHE** deletes that model's files. Reloading the page checks actual cached files before displaying readiness. The app requests persistent storage, but browsers can decline; clearing site data also removes models. localhost and 127.0.0.1, different ports and browser profiles have separate caches.

The application and map still need their normal local web server and map/data sources. With the application served locally, cached AI models do not require internet for inference. Missing models must be explicitly downloaded using the settings buttons.

## Optional web search

Leave **Search MCP URL** empty to use local AI without search. To enable search, enter a local Streamable HTTP MCP endpoint such as http://127.0.0.1:8000/mcp. Search sends only the search query through this bridge. The default tool name is google_search; advanced integrations can set LOCAL_AI_MCP_TOOL in the app environment. A search MCP server is optional and is not an inference runtime.

## Model sources

- [Ternary Bonsai ONNX models](https://huggingface.co/onnx-community/Ternary-Bonsai-1.7B-ONNX): true ternary weights packed as two-bit ONNX q2f16, using Transformers.js 4.3.
- [Whisper](https://huggingface.co/Xenova/whisper-tiny): multilingual quantized ONNX models.
- [Piper voices](https://huggingface.co/rhasspy/piper-voices), with the [Piper WASM phonemizer](https://github.com/diffusionstudio/piper-wasm).

Exact model revisions, file URLs and byte sizes are pinned in src/voice/localModels.json. Updating a revision creates new cache entries; it does not silently replace a downloaded model.
