import { Modal } from './Modal';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', onConfirm, onCancel }: Props) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="card-desc" style={{ marginBottom: 0 }}>{message}</p>
      <div className="card-actions" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn btn-delete" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}
