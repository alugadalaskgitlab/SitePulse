import { useEffect, useState } from "react";
import { AttachmentViewer } from "@/components/AttachmentViewer";
import { IN_APP_DOCUMENT_PREVIEW_EVENT, type InAppDocumentPreviewRequest } from "@/lib/installedApp";

export function DocumentPreviewHost() {
  const [documentPreview, setDocumentPreview] = useState<InAppDocumentPreviewRequest | null>(null);

  useEffect(() => {
    const onPreview = (event: Event) => {
      const request = (event as CustomEvent<InAppDocumentPreviewRequest>).detail;
      if (request) setDocumentPreview(request);
    };
    window.addEventListener(IN_APP_DOCUMENT_PREVIEW_EVENT, onPreview);
    return () => window.removeEventListener(IN_APP_DOCUMENT_PREVIEW_EVENT, onPreview);
  }, []);

  return (
    <AttachmentViewer
      attachment={null}
      documentPreview={documentPreview}
      onClose={() => setDocumentPreview(null)}
    />
  );
}
