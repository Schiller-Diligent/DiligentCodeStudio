import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { xml } from "@codemirror/lang-xml";
import "./DcsCodeMirrorEditor.css";

type EditorJumpLocation = {
  path: string;
  lineNumber: number;
  column: number;
  length?: number;
} | null;

type DcsCodeMirrorEditorProps = {
  fileName: string;
  filePath?: string;
  content: string;
  theme?: string;
  fontSize?: number;
  wordWrap?: boolean;
  jumpLocation?: EditorJumpLocation;
  onJumpComplete?: () => void;
  onChange: (value: string) => void;
  onCursorChange?: (lineNumber: number, column: number) => void;
};

function extensionFromFileName(fileName: string): string {
  const normalized = fileName.toLowerCase();
  const lastDot = normalized.lastIndexOf(".");
  return lastDot >= 0 ? normalized.slice(lastDot) : "";
}

function languageExtension(fileName: string): Extension | null {
  const lower = fileName.toLowerCase();
  const ext = extensionFromFileName(lower);

  if ([".ts", ".tsx"].includes(ext)) return javascript({ jsx: ext === ".tsx", typescript: true });
  if ([".js", ".jsx", ".mjs", ".cjs"].includes(ext)) return javascript({ jsx: ext === ".jsx" });
  if ([".html", ".htm"].includes(ext)) return html();
  if ([".css", ".scss", ".sass", ".less"].includes(ext)) return css();
  if ([".json", ".jsonc"].includes(ext)) return json();
  if ([".md", ".markdown"].includes(ext)) return markdown();
  if ([".py"].includes(ext)) return python();
  if ([".rs"].includes(ext)) return rust();
  if ([".xml", ".svg", ".xaml"].includes(ext)) return xml();

  return null;
}

function isLightTheme(theme?: string): boolean {
  const value = String(theme || "").toLowerCase();
  return value.includes("light");
}

function editorHeight(): string {
  return "calc(100vh - 260px)";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function clampScrollTop(element: HTMLElement, value: number): number {
  const max = Math.max(element.scrollHeight - element.clientHeight, 0);
  return clamp(value, 0, max);
}

function readPixel(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePath(value?: string): string {
  return String(value || "").replace(/\\/g, "/").replace(/^file:\/\//, "").toLowerCase();
}

export function DcsCodeMirrorEditor({
  fileName,
  filePath,
  content,
  theme,
  fontSize,
  wordWrap,
  jumpLocation,
  onJumpComplete,
  onChange,
  onCursorChange,
}: DcsCodeMirrorEditorProps) {
  const viewRef = useRef<EditorView | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const lineGutterRef = useRef<HTMLPreElement | null>(null);
  const minimapRef = useRef<HTMLPreElement | null>(null);
  const syncingRef = useRef(false);
  const lastJumpKeyRef = useRef("");
  const [visibleRange, setVisibleRange] = useState({ top: 0, height: 14 });
  const effectiveFontSize = Number.isFinite(fontSize) ? Math.max(Number(fontSize), 11) : 14;
  const lineHeight = Math.round(effectiveFontSize * 1.55 * 100) / 100;
  const height = editorHeight();

  const lines = useMemo(() => (content ? content.split("\n") : [""]), [content]);
  const lineCount = Math.max(lines.length, 1);
  const lineNumbers = useMemo(() => Array.from({ length: lineCount }, (_, index) => String(index + 1)).join("\n"), [lineCount]);
  const minimapContent = useMemo(() => content || "", [content]);

  const getScroller = useCallback((): HTMLElement | null => {
    return viewRef.current?.scrollDOM ?? shellRef.current?.querySelector<HTMLElement>(".cm-scroller") ?? null;
  }, []);

  const syncSidebarsFromScroller = useCallback((scroller?: HTMLElement | null) => {
    const source = scroller ?? getScroller();
    const gutter = lineGutterRef.current;
    const minimap = minimapRef.current;

    if (!source) return;

    if (gutter) {
      gutter.scrollTop = source.scrollTop;
    }

    if (minimap && !syncingRef.current) {
      const maxScroll = Math.max(source.scrollHeight - source.clientHeight, 1);
      const ratio = source.scrollTop / maxScroll;
      const minimapMaxScroll = Math.max(minimap.scrollHeight - minimap.clientHeight, 1);
      minimap.scrollTop = ratio * minimapMaxScroll;
    }

    const maxScroll = Math.max(source.scrollHeight - source.clientHeight, 1);
    const ratioTop = source.scrollTop / maxScroll;
    const ratioHeight = clamp(source.clientHeight / Math.max(source.scrollHeight, 1), 0.03, 1);

    setVisibleRange({
      top: clamp(ratioTop * 100, 0, 100),
      height: clamp(ratioHeight * 100, 4, 100),
    });
  }, [getScroller]);

  const stabilizeCodeMirrorAfterScroll = useCallback((view?: EditorView | null) => {
    const editorView = view ?? viewRef.current;
    if (!editorView) return;

    try {
      editorView.requestMeasure();
    } catch {
      // best effort
    }
  }, []);

  const scrollMainEditorBy = useCallback((deltaY: number, deltaX = 0) => {
    const scroller = getScroller();
    const view = viewRef.current;
    if (!scroller) return false;

    const beforeTop = scroller.scrollTop;
    const beforeLeft = scroller.scrollLeft;

    scroller.scrollTop = clampScrollTop(scroller, scroller.scrollTop + deltaY);
    scroller.scrollLeft = Math.max(scroller.scrollLeft + deltaX, 0);

    scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    stabilizeCodeMirrorAfterScroll(view);
    window.requestAnimationFrame(() => {
      stabilizeCodeMirrorAfterScroll(view);
      syncSidebarsFromScroller(scroller);
    });

    return beforeTop !== scroller.scrollTop || beforeLeft !== scroller.scrollLeft;
  }, [getScroller, stabilizeCodeMirrorAfterScroll, syncSidebarsFromScroller]);

  const handleWheelCapture = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;

    if (target?.closest(".dcs-codemirror-minimap-panel")) {
      return;
    }

    const moved = scrollMainEditorBy(event.deltaY, event.deltaX);
    if (moved) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, [scrollMainEditorBy]);

  const handleKeyDownCapture = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const scroller = getScroller();
    if (!scroller) return;

    const page = Math.max(scroller.clientHeight - 80, 120);
    let handled = true;

    if (event.key === "PageDown") {
      scrollMainEditorBy(page);
    } else if (event.key === "PageUp") {
      scrollMainEditorBy(-page);
    } else if (event.key === "Home" && event.ctrlKey) {
      scroller.scrollTop = 0;
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
      stabilizeCodeMirrorAfterScroll();
      syncSidebarsFromScroller(scroller);
    } else if (event.key === "End" && event.ctrlKey) {
      scroller.scrollTop = scroller.scrollHeight;
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
      stabilizeCodeMirrorAfterScroll();
      syncSidebarsFromScroller(scroller);
    } else {
      handled = false;
    }

    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, [getScroller, scrollMainEditorBy, stabilizeCodeMirrorAfterScroll, syncSidebarsFromScroller]);

  const jumpToLine = useCallback((lineNumber: number, column = 1, length = 1) => {
    const view = viewRef.current;
    if (!view) return;

    const boundedLineNumber = clamp(Math.round(lineNumber), 1, Math.max(view.state.doc.lines, 1));
    const line = view.state.doc.line(boundedLineNumber);
    const offset = clamp(Math.round(column) - 1, 0, Math.max(line.length, 0));
    const start = line.from + offset;
    const end = clamp(start + Math.max(Math.round(length), 1), start, line.to);

    view.dispatch({
      effects: EditorView.scrollIntoView(start, { y: "center" }),
      selection: { anchor: start, head: end },
    });

    stabilizeCodeMirrorAfterScroll(view);
    window.requestAnimationFrame(() => {
      stabilizeCodeMirrorAfterScroll(view);
      syncSidebarsFromScroller(view.scrollDOM);
    });

    view.focus();
  }, [stabilizeCodeMirrorAfterScroll, syncSidebarsFromScroller]);

  useEffect(() => {
    if (!jumpLocation || !viewRef.current) return;

    const currentPath = normalizePath(filePath);
    const requestedPath = normalizePath(jumpLocation.path);

    if (currentPath && requestedPath && currentPath !== requestedPath) return;

    const key = `${requestedPath}:${jumpLocation.lineNumber}:${jumpLocation.column}:${jumpLocation.length ?? 1}`;
    if (lastJumpKeyRef.current === key) return;

    lastJumpKeyRef.current = key;

    window.setTimeout(() => {
      jumpToLine(jumpLocation.lineNumber, jumpLocation.column, jumpLocation.length ?? 1);
      onJumpComplete?.();
    }, 80);
  }, [filePath, jumpLocation, jumpToLine, onJumpComplete]);

  const lineNumberFromMinimapEvent = useCallback((event: React.MouseEvent<HTMLPreElement>): number => {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const style = window.getComputedStyle(target);
    const miniLineHeight = readPixel(style.lineHeight, 3.6);
    const paddingTop = readPixel(style.paddingTop, 0);

    const yInsideViewport = event.clientY - rect.top;
    const yInsideContent = target.scrollTop + yInsideViewport - paddingTop;
    const lineNumber = Math.floor(yInsideContent / miniLineHeight) + 1;

    return clamp(lineNumber, 1, lineCount);
  }, [lineCount]);

  const jumpEditorFromMinimap = useCallback((event: React.MouseEvent<HTMLPreElement>) => {
    jumpToLine(lineNumberFromMinimapEvent(event));
  }, [jumpToLine, lineNumberFromMinimapEvent]);

  const handleMinimapScroll = useCallback((event: React.UIEvent<HTMLPreElement>) => {
    const scroller = getScroller();
    const minimap = event.currentTarget;

    if (!scroller || syncingRef.current) return;

    const minimapMaxScroll = Math.max(minimap.scrollHeight - minimap.clientHeight, 1);
    const ratio = minimap.scrollTop / minimapMaxScroll;
    const editorMaxScroll = Math.max(scroller.scrollHeight - scroller.clientHeight, 1);

    syncingRef.current = true;
    scroller.scrollTop = ratio * editorMaxScroll;
    scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    stabilizeCodeMirrorAfterScroll();

    window.setTimeout(() => {
      syncingRef.current = false;
      stabilizeCodeMirrorAfterScroll();
      syncSidebarsFromScroller(scroller);
    }, 0);
  }, [getScroller, stabilizeCodeMirrorAfterScroll, syncSidebarsFromScroller]);

  const extensions = useMemo(() => {
    const list: Extension[] = [];

    const language = languageExtension(fileName || filePath || "");
    if (language) list.push(language);

    // Keep this false for reliable external line-number calibration.
    if (wordWrap === true) {
      list.push(EditorView.lineWrapping);
    }

    list.push(
      EditorView.updateListener.of((update) => {
        if (update.docChanged || update.viewportChanged || update.geometryChanged) {
          window.requestAnimationFrame(() => {
            stabilizeCodeMirrorAfterScroll(update.view);
            syncSidebarsFromScroller(update.view.scrollDOM);
          });
        }

        if (!onCursorChange) return;
        if (!update.selectionSet && !update.docChanged && !update.focusChanged) return;

        const position = update.state.selection.main.head;
        const line = update.state.doc.lineAt(position);
        const column = Math.max(position - line.from + 1, 1);

        onCursorChange(line.number, column);
      }),
    );

    list.push(
      EditorView.theme({
        "&": {
          width: "100%",
          height,
          minHeight: height,
          fontSize: `${effectiveFontSize}px`,
        },
        ".cm-scroller": {
          width: "100%",
          height,
          minHeight: height,
          maxHeight: height,
          overflow: "scroll",
          fontFamily: '"Cascadia Code", Consolas, "Courier New", monospace',
          lineHeight: `${lineHeight}px`,
        },
        ".cm-content": {
          minHeight: "auto",
          padding: "16px 0 120px",
        },
        ".cm-line": {
          paddingRight: "24px",
          lineHeight: `${lineHeight}px`,
        },
        ".cm-gutters": {
          display: "none",
        },
      }),
    );

    return list;
  }, [effectiveFontSize, fileName, filePath, height, lineHeight, onCursorChange, stabilizeCodeMirrorAfterScroll, syncSidebarsFromScroller, wordWrap]);

  return (
    <div
      ref={shellRef}
      className="dcs-codemirror-editor-shell"
      data-dcs-editor-kind="codemirror"
      style={{ height, minHeight: height, ["--dcs-editor-line-height" as string]: `${lineHeight}px` }}
      onWheelCapture={handleWheelCapture}
      onKeyDownCapture={handleKeyDownCapture}
      tabIndex={0}
    >
      <aside className="dcs-codemirror-line-gutter-panel" aria-label="Line numbers">
        <pre
          ref={lineGutterRef}
          className="dcs-codemirror-line-gutter"
          onWheel={(event) => {
            const moved = scrollMainEditorBy(event.deltaY, event.deltaX);
            if (moved) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
        >
          {lineNumbers}
        </pre>
      </aside>

      <div className="dcs-codemirror-main">
        <CodeMirror
          key={`${filePath || fileName}:${theme || "default"}:${effectiveFontSize}:${wordWrap === true ? "wrap" : "nowrap"}`}
          value={content}
          height={height}
          minHeight={height}
          width="100%"
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: true,
            highlightActiveLineGutter: false,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            rectangularSelection: true,
            crosshairCursor: true,
            searchKeymap: true,
            lintKeymap: true,
          }}
          theme={isLightTheme(theme) ? "light" : oneDark}
          extensions={extensions}
          onChange={onChange}
          onCreateEditor={(view) => {
            viewRef.current = view;
            window.requestAnimationFrame(() => {
              stabilizeCodeMirrorAfterScroll(view);
              syncSidebarsFromScroller(view.scrollDOM);
            });
          }}
        />
      </div>

      <aside className="dcs-codemirror-minimap-panel" aria-label="Code minimap">
        <div
          className="dcs-codemirror-minimap-viewport"
          aria-hidden="true"
          style={{ top: `${visibleRange.top}%`, height: `${visibleRange.height}%` }}
        />

        <pre
          ref={minimapRef}
          className="dcs-codemirror-minimap"
          onClick={jumpEditorFromMinimap}
          onScroll={handleMinimapScroll}
          title="Click a line in the minimap to jump the editor to that line"
        >
          {minimapContent}
        </pre>
      </aside>
    </div>
  );
}