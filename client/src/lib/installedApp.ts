export const IN_APP_DOCUMENT_PREVIEW_EVENT = "sitepulse:in-app-document-preview";

export type InAppDocumentPreviewRequest = {
  url?: string;
  html?: string;
  title: string;
  fileName: string;
  printable?: boolean;
};

export function isInstalledAppMode(): boolean {
  if (typeof window === "undefined") return false;
  const displayModeStandalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return displayModeStandalone || iosStandalone;
}

export function requestInAppDocumentPreview(request: InAppDocumentPreviewRequest): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<InAppDocumentPreviewRequest>(IN_APP_DOCUMENT_PREVIEW_EVENT, { detail: request }));
}

export function openDocumentOrPreview(url: string, fileName: string, title = fileName): void {
  if (isInstalledAppMode()) {
    requestInAppDocumentPreview({ url, fileName, title });
    return;
  }
  window.open(url, "_blank");
}

export function downloadOrOpenInNewTab(url: string, fileName: string): void {
  if (!isInstalledAppMode()) {
    window.open(url, "_blank");
    return;
  }
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function openPrintableHtmlOrPreview(
  html: string,
  title: string,
  fileName: string,
  features?: string,
): void {
  if (isInstalledAppMode()) {
    requestInAppDocumentPreview({ html, title, fileName, printable: true });
    return;
  }

  const popup = window.open("", "_blank", features);
  if (!popup) return;
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 400);
}
