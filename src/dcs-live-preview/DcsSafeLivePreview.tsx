import { useCallback, useEffect, useRef, useState } from "react";
import "./DcsSafeLivePreview.css";

const DEFAULT_PREVIEW_URL = "http://127.0.0.1:5173";

type PickedElementDetail = {
  tagName: string;
  id?: string;
  className?: string;
  text?: string;
  selector: string;
  x?: number;
  y?: number;
};

function normalizePreviewUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_PREVIEW_URL;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

function readInitialUrl(): string {
  try {
    return localStorage.getItem("dcs.safeLivePreview.url") || DEFAULT_PREVIEW_URL;
  } catch {
    return DEFAULT_PREVIEW_URL;
  }
}

function cleanText(value: string | null | undefined, maxLength = 120): string {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cssSelectorForElement(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === 1 && parts.length < 6) {
    const tag = current.tagName.toLowerCase();
    const id = current.id ? `#${current.id}` : "";
    const className = Array.from(current.classList || [])
      .filter(Boolean)
      .filter((item) => item !== "dcs-live-preview-hover-target")
      .slice(0, 3)
      .map((item) => `.${item}`)
      .join("");

    parts.unshift(`${tag}${id}${className}`);
    if (current.id) break;
    current = current.parentElement;
  }

  return parts.join(" > ");
}

function describeElement(element: Element, point?: { x: number; y: number }): PickedElementDetail {
  const htmlElement = element as HTMLElement;
  const className = Array.from(element.classList || [])
    .filter(Boolean)
    .filter((item) => item !== "dcs-live-preview-hover-target")
    .join(" ");

  return {
    tagName: element.tagName.toLowerCase(),
    id: element.id || undefined,
    className: className || undefined,
    text: cleanText(htmlElement.innerText || htmlElement.textContent || "", 160) || undefined,
    selector: cssSelectorForElement(element),
    x: point?.x,
    y: point?.y,
  };
}

function installInspectorStyles(documentRef: Document) {
  if (documentRef.getElementById("dcs-live-preview-inspector-style")) return;

  const style = documentRef.createElement("style");
  style.id = "dcs-live-preview-inspector-style";
  style.textContent = `
    .dcs-live-preview-hover-target {
      outline: 4px solid #facc15 !important;
      outline-offset: 3px !important;
      cursor: crosshair !important;
    }
  `;
  documentRef.head.appendChild(style);
}

export function DcsSafeLivePreview() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const hoveredElementRef = useRef<Element | null>(null);
  const iframeCleanupRef = useRef<(() => void) | null>(null);

  const [urlInput, setUrlInput] = useState(readInitialUrl);
  const [activeUrl, setActiveUrl] = useState("");
  const [frameKey, setFrameKey] = useState(0);
  const [inspectMode, setInspectMode] = useState(true);
  const [status, setStatus] = useState("Select Element mode is ready.");
  const [selectedElement, setSelectedElement] = useState<PickedElementDetail | null>(null);
  const [lastPoint, setLastPoint] = useState<{ x: number; y: number } | null>(null);

  const getPreviewDocument = useCallback((): Document | null => {
    try {
      const iframe = iframeRef.current;
      return iframe?.contentDocument || iframe?.contentWindow?.document || null;
    } catch {
      return null;
    }
  }, []);

  const clearHover = useCallback(() => {
    try {
      hoveredElementRef.current?.classList.remove("dcs-live-preview-hover-target");
    } catch {
      // best effort
    }
    hoveredElementRef.current = null;
  }, []);

  const dispatchPickedElement = useCallback((detail: PickedElementDetail) => {
    window.dispatchEvent(new CustomEvent("dcs-live-preview-pick-element", { detail }));
  }, []);

  const selectElement = useCallback((element: Element, point?: { x: number; y: number }, openNow = false) => {
    clearHover();

    try {
      element.classList.add("dcs-live-preview-hover-target");
      hoveredElementRef.current = element;
    } catch {
      // best effort
    }

    const detail = describeElement(element, point);
    setSelectedElement(detail);

    const readable = detail.id ? `#${detail.id}` : detail.className ? `.${detail.className.split(" ")[0]}` : detail.text ? `"${detail.text}"` : detail.selector;
    setStatus(`${openNow ? "Clicked" : "Hovering"} ${detail.tagName} ${readable}`);

    if (openNow) {
      dispatchPickedElement(detail);
    }
  }, [clearHover, dispatchPickedElement]);

  const elementAtFramePoint = useCallback((clientX: number, clientY: number): Element | null => {
    const iframe = iframeRef.current;
    const documentRef = getPreviewDocument();

    if (!iframe || !documentRef) return null;

    const rect = iframe.getBoundingClientRect();
    const x = Math.round(clientX - rect.left);
    const y = Math.round(clientY - rect.top);

    setLastPoint({ x, y });

    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;

    try {
      installInspectorStyles(documentRef);
      return documentRef.elementFromPoint(x, y);
    } catch {
      return null;
    }
  }, [getPreviewDocument]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!inspectMode) return;

    const element = elementAtFramePoint(event.clientX, event.clientY);
    if (!element) {
      setStatus("Picker is visible/capturing, but the iframe document is not inspectable.");
      return;
    }

    if (hoveredElementRef.current !== element) {
      selectElement(element, lastPoint || undefined, false);
    }
  }, [elementAtFramePoint, inspectMode, lastPoint, selectElement]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!inspectMode) return;

    event.preventDefault();
    event.stopPropagation();

    const element = elementAtFramePoint(event.clientX, event.clientY);
    if (!element) {
      setStatus("Click captured by Select Element, but no iframe element was readable under the mouse.");
      return;
    }

    selectElement(element, lastPoint || undefined, true);
  }, [elementAtFramePoint, inspectMode, lastPoint, selectElement]);

  const installIframeDirectListeners = useCallback(() => {
    iframeCleanupRef.current?.();
    iframeCleanupRef.current = null;

    if (!inspectMode) return;

    const documentRef = getPreviewDocument();
    if (!documentRef?.body) {
      setStatus("Preview loaded, but DCS cannot attach direct listeners to this iframe.");
      return;
    }

    try {
      installInspectorStyles(documentRef);
    } catch {
      setStatus("Preview loaded, but selector styles could not be installed.");
      return;
    }

    const onMove = (event: MouseEvent) => {
      if (!inspectMode) return;
      const target = event.target;
      if (target instanceof Element) {
        selectElement(target, { x: event.clientX, y: event.clientY }, false);
      }
    };

    const onClick = (event: MouseEvent) => {
      if (!inspectMode) return;
      const target = event.target;
      if (target instanceof Element) {
        event.preventDefault();
        event.stopPropagation();
        selectElement(target, { x: event.clientX, y: event.clientY }, true);
      }
    };

    documentRef.addEventListener("mousemove", onMove, true);
    documentRef.addEventListener("click", onClick, true);

    iframeCleanupRef.current = () => {
      try {
        documentRef.removeEventListener("mousemove", onMove, true);
        documentRef.removeEventListener("click", onClick, true);
      } catch {
        // best effort
      }
    };

    setStatus("Select Element is attached. Hover or click inside the preview.");
  }, [getPreviewDocument, inspectMode, selectElement]);

  const startPreview = useCallback(() => {
    const normalized = normalizePreviewUrl(urlInput);
    setUrlInput(normalized);
    setActiveUrl(normalized);
    setFrameKey((value) => value + 1);
    setSelectedElement(null);
    setStatus(`Previewing ${normalized}.`);

    try {
      localStorage.setItem("dcs.safeLivePreview.url", normalized);
    } catch {
      // localStorage is convenience-only
    }
  }, [urlInput]);

  const refreshPreview = useCallback(() => {
    if (!activeUrl) {
      startPreview();
      return;
    }

    setFrameKey((value) => value + 1);
    setSelectedElement(null);
    setStatus(`Refreshed ${activeUrl}. Select Element is ${inspectMode ? "ON" : "OFF"}.`);
  }, [activeUrl, inspectMode, startPreview]);

  const stopPreview = useCallback(() => {
    iframeCleanupRef.current?.();
    iframeCleanupRef.current = null;
    setActiveUrl("");
    setSelectedElement(null);
    setStatus("Preview stopped.");
  }, []);

  useEffect(() => {
    startPreview();
    // Run once on tab mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => installIframeDirectListeners(), 250);
    return () => window.clearTimeout(timeout);
  }, [frameKey, inspectMode, activeUrl, installIframeDirectListeners]);

  useEffect(() => {
    return () => {
      iframeCleanupRef.current?.();
      clearHover();
    };
  }, [clearHover]);

  return (
    <section className="dcs-safe-live-preview dcs-safe-live-preview-forced-selector" aria-label="Live Preview">
      <header className="dcs-safe-live-preview-header">
        <div className="dcs-safe-live-preview-title">
          <strong>Live Preview</strong>
          <span>Hover or click inside the preview to locate the matching source.</span>
        </div>

        <button
          type="button"
          className={inspectMode ? "dcs-live-preview-inline-toggle is-on" : "dcs-live-preview-inline-toggle"}
          onClick={() => {
            setInspectMode((value) => !value);
            clearHover();
            setStatus(`Select Element is now ${inspectMode ? "OFF" : "ON"}.`);
          }}
        >
          Select Element: {inspectMode ? "ON" : "OFF"}
        </button>
      </header>

      <div className="dcs-safe-live-preview-toolbar">
        <input
          aria-label="Live Preview URL"
          value={urlInput}
          onChange={(event) => setUrlInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") startPreview();
          }}
          placeholder={DEFAULT_PREVIEW_URL}
        />

        <button type="button" onClick={startPreview}>Start</button>
        <button type="button" onClick={refreshPreview}>Refresh</button>
        <button type="button" onClick={stopPreview} disabled={!activeUrl}>Stop</button>
      </div>

      <div className="dcs-safe-live-preview-status">{status}</div>

      {selectedElement && (
        <div className="dcs-safe-live-preview-selection">
          <strong>Selected:</strong> {selectedElement.selector}
          {selectedElement.text ? <span>Text: {selectedElement.text}</span> : null}
          {lastPoint ? <span>Point: {lastPoint.x}, {lastPoint.y}</span> : null}
        </div>
      )}

      <div className="dcs-safe-live-preview-frame">
        {activeUrl ? (
          <>
            <iframe
              ref={iframeRef}
              key={frameKey}
              title="Diligent Code Studio Live Preview"
              src={activeUrl}
              sandbox="allow-downloads allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
              onLoad={() => {
                clearHover();
                setSelectedElement(null);
                window.setTimeout(() => installIframeDirectListeners(), 250);
              }}
            />

            {inspectMode && (
              <div
                className="dcs-live-preview-picker-layer"
                onPointerMove={handlePointerMove}
                onPointerDown={handlePointerDown}
                title="Select Element is on. Click an element to search/open its source."
              >
                <div className="dcs-live-preview-picker-badge">Select Element</div>
              </div>
            )}
          </>
        ) : (
          <div className="dcs-safe-live-preview-empty">
            <strong>Preview stopped.</strong>
            <p>Press Start to load the current preview URL.</p>
          </div>
        )}
      </div>
    </section>
  );
}