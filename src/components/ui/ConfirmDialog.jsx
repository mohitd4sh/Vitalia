import { AlertTriangle } from "lucide-react";
import { createPortal } from "react-dom";

function ConfirmDialog({ options, onCancel, onConfirm }) {
  if (!options) return null;

  return createPortal(
    <div className="modal-backdrop confirm-dialog-backdrop" onClick={onCancel}>
      <section
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="confirm-dialog-icon"><AlertTriangle size={22} /></div>
        <span className="eyebrow">{options.eyebrow || "CONFIRM ACTION"}</span>
        <h2 id="confirm-dialog-title">{options.title}</h2>
        <p id="confirm-dialog-description">{options.description}</p>
        <div className="confirm-dialog-actions">
          <button className="secondary-action" type="button" autoFocus onClick={onCancel}>
            {options.cancelLabel || "Cancel"}
          </button>
          <button className="confirm-dialog-confirm" type="button" onClick={onConfirm}>
            {options.confirmLabel || "Confirm"}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}

export default ConfirmDialog;
