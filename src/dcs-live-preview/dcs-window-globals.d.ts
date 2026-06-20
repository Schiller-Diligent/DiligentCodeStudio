import type { DcsSourceLocation } from "./DcsLivePreviewBridge";

declare global {
  interface Window {
    __DCS_MONACO_MAIN_EDITOR__?: any;
    __DCS_MONACO_MAIN_MONACO__?: any;
    __DCS_CURRENT_FILE_PATH__?: string;
    __DCS_MAIN_EDITOR_OPEN_FILE_AT_LOCATION__?: (location: DcsSourceLocation) => boolean | void | Promise<boolean | void>;
  }
}

export {};