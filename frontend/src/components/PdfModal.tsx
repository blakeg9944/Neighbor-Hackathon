import type { GeneratedPdf } from "../lib/types";
import { formatDate, Modal } from "./ui";

export default function PdfModal({
  pdf,
  filename,
  onClose,
}: {
  pdf: GeneratedPdf | null;
  filename: string;
  onClose: () => void;
}) {
  return (
    <Modal open={!!pdf} onClose={onClose} wide title={pdf ? `Resume · ${formatDate(pdf.created_at)}` : ""}>
      {pdf && (
        <div className="flex flex-col">
          <iframe src={pdf.url} title="Resume PDF" className="h-[70vh] w-full border-b border-line bg-panel" />
          <div className="flex justify-end px-5 py-3">
            <a
              href={pdf.url}
              download={filename}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-[34px] items-center border border-accent bg-accent px-3.5 font-medium text-on-accent hover:border-solid hover:bg-solid hover:text-on-solid"
            >
              Download PDF ↓
            </a>
          </div>
        </div>
      )}
    </Modal>
  );
}

export const pdfFilename = (title: string | null, company: string | null) =>
  `Resume - ${[title, company].filter(Boolean).join(" - ") || "Tailored"}.pdf`.replace(/[\\/:*?"<>|]/g, "");
