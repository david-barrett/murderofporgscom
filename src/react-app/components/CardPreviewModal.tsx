import { useState } from "react";
import { RotateCw, X } from "lucide-react";

export interface CardPreviewState {
  name: string;
  url: string;
  orientation?: "horizontal" | "vertical";
  backUrl?: string | null;
  initialSide?: "front" | "back";
}

interface CardPreviewModalProps {
  preview: CardPreviewState | null;
  onClose: () => void;
}

function CardPreviewDialog({
  preview,
  onClose,
}: {
  preview: CardPreviewState;
  onClose: () => void;
}) {
  const [side, setSide] = useState<"front" | "back">(
    preview.initialSide ?? "front"
  );

  const hasBack = Boolean(preview.backUrl);
  const showingBack = hasBack && side === "back";
  const activeUrl = showingBack ? preview.backUrl! : preview.url;
  const activeOrientation = showingBack
    ? "vertical"
    : (preview.orientation ?? "vertical");
  const isHorizontal = activeOrientation === "horizontal";

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-slate-900 border border-slate-800 rounded-2xl p-4 w-full space-y-3 shadow-2xl relative transition-all ${
          isHorizontal ? "max-w-lg" : "max-w-sm"
        }`}
      >
        <div className="flex justify-between items-center gap-2">
          <h4 className="text-xs font-bold text-slate-200 truncate">
            {preview.name}
            {hasBack && (
              <span className="ml-1.5 text-[10px] font-medium text-cyan-400">
                ({showingBack ? "Back · Unit" : "Front · Leader"})
              </span>
            )}
          </h4>
          <div className="flex items-center gap-2 shrink-0">
            {hasBack && (
              <button
                type="button"
                onClick={() => setSide((s) => (s === "front" ? "back" : "front"))}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 inline-flex items-center gap-1 cursor-pointer transition"
              >
                <RotateCw size={12} />
                {showingBack ? "Show Front" : "Show Back"}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white cursor-pointer"
              aria-label="Close card preview"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div
          className={`w-full rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center ${
            isHorizontal ? "aspect-[7/5]" : "aspect-[5/7]"
          }`}
        >
          <img
            src={activeUrl}
            alt={`${preview.name}${showingBack ? " (Back)" : ""}`}
            className="w-full h-full object-contain"
          />
        </div>
      </div>
    </div>
  );
}

export function CardPreviewModal({ preview, onClose }: CardPreviewModalProps) {
  if (!preview) return null;
  return (
    <CardPreviewDialog
      key={`${preview.name}-${preview.url}-${preview.initialSide ?? "front"}`}
      preview={preview}
      onClose={onClose}
    />
  );
}
