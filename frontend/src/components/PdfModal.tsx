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
    <Modal open={!!pdf} onClose={onClose} wide title={pdf ? `Resume, ${formatDate(pdf.created_at)}` : ""}>
      {pdf && (
        <div className="flex flex-col gap-3 p-4">
          <iframe src={pdf.url} title="Resume PDF" className="h-[70vh] w-full rounded border border-slate-200" />
          <div className="flex justify-end">
            <a
              href={pdf.url}
              download={filename}
              target="_blank"
              rel="noreferrer"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Download PDF
            </a>
          </div>
        </div>
      )}
    </Modal>
  );
}

export const pdfFilename = (title: string | null, company: string | null) =>
  `Resume - ${[title, company].filter(Boolean).join(" - ") || "Tailored"}.pdf`.replace(/[\\/:*?"<>|]/g, "");
