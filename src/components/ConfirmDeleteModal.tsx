import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

export interface DeleteConfirmationRequest {
  type: 'service' | 'widget' | 'demo_all' | 'demo_gateways';
  targetId?: string;
  title: string;
  description: string;
  confirmLabel: string;
}

interface ConfirmDeleteModalProps {
  request: DeleteConfirmationRequest | null;
  isDark: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  request,
  isDark,
  onCancel,
  onConfirm,
}) => {
  if (!request) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
    >
      <div
        className={`w-full max-w-md rounded-xl border p-6 shadow-xl ${
          isDark
            ? 'bg-[#0F172A] border-slate-700 text-slate-100'
            : 'bg-white border-slate-300 text-slate-900'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-red-500/15 border border-red-500/40 text-red-400 shrink-0">
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-red-400">
                Підтвердження видалення
              </div>
              <h2 id="confirm-delete-title" className="text-base font-bold mt-0.5">
                {request.title}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            aria-label="Скасувати видалення"
            className="p-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p
          className={`mt-4 text-xs leading-relaxed ${
            isDark ? 'text-slate-300' : 'text-slate-600'
          }`}
        >
          {request.description}
        </p>

        <div
          className={`mt-6 pt-4 border-t flex items-center justify-end gap-2.5 ${
            isDark ? 'border-slate-800' : 'border-slate-200'
          }`}
        >
          <button
            type="button"
            onClick={onCancel}
            className={`px-4 py-2 text-xs font-medium rounded-lg border transition-colors ${
              isDark
                ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                : 'border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
          >
            Скасувати
          </button>
          <button
            type="button"
            onClick={onConfirm}
            data-testid="confirm-delete-submit"
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{request.confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
