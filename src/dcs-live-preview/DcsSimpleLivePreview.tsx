import { useCallback, useEffect, useState } from "react";
import "./DcsSimpleLivePreview.css";

const DEFAULT_PREVIEW_URL = "http://127.0.0.1:5173";

function normalizePreviewUrl(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return DEFAULT_PREVIEW_URL;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `http://${trimmed}`;
}

function readInitialUrl(): string {
  try {
    return localStorage.getItem("dcs.simpleLivePreview.url") || DEFAULT_PREVIEW_URL;
  } catch {
    return DEFAULT_PREVIEW_URL;
  }
}

export function DcsSimpleLivePreview() {
  const [urlInput, setUrlInput] = useState(readInitialUrl);
  const [activeUrl, setActiveUrl] = useState("");
  const [frameKey, setFrameKey] = useState(0);
  const [status, setStatus] = useState("Live Preview is ready.");

  const startPreview = useCallback(() => {
    const normalized = normalizePreviewUrl(urlInput);
    setActiveUrl(normalized);
    setFrameKey((value) => value + 1);
    setStatus(`Previewing ${normalized}`);

    try {
      localStorage.setItem("dcs.simpleLivePreview.url", normalized);
    } catch {
      // best effort only
    }
  }, [urlInput]);

  const stopPreview = useCallback(() => {
    setActiveUrl("");
    setStatus("Preview stopped.");
  }, []);

  const refreshPreview = useCallback(() => {
    if (!activeUrl) {
      startPreview();
      return;
    }

    setFrameKey((value) => value + 1);
    setStatus(`Refreshed ${activeUrl}`);
  }, [activeUrl, startPreview]);

  useEffect(() => {
    if (!activeUrl) {
      startPreview();
    }
    // Run only on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="dcs-simple-live-preview" aria-label="Live Preview">
      <header className="dcs-simple-live-preview-header">
        <div>
          <strong>Live Preview</strong>
          <span>Preview your running Vite app inside Diligent Code Studio.</span>
        </div>
      </header>

      <div className="dcs-simple-live-preview-toolbar">
        <input
          aria-label="Live Preview URL"
          value={urlInput}
          onChange={(event) => setUrlInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              startPreview();
            }
          }}
          placeholder={DEFAULT_PREVIEW_URL}
        />

        <button type="button" onClick={startPreview}>Start</button>
        <button type="button" onClick={refreshPreview}>Refresh</button>
        <button type="button" onClick={stopPreview} disabled={!activeUrl}>Stop</button>
      </div>

      <div className="dcs-simple-live-preview-status">{status}</div>

      <div className="dcs-simple-live-preview-frame">
        {activeUrl ? (
          <iframe
            key={frameKey}
            title="Diligent Code Studio Live Preview"
            src={activeUrl}
            sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
          />
        ) : (
          <div className="dcs-simple-live-preview-empty">
            <strong>Preview stopped.</strong>
            <p>Press Start to load the app preview.</p>
          </div>
        )}
      </div>
    </section>
  );
}