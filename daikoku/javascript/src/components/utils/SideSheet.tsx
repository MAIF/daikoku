import classNames from 'classnames';
import { X } from 'lucide-react';
import { ReactNode, useContext, useId } from 'react';
import { createPortal } from 'react-dom';

import { I18nContext, ModalContext } from '../../contexts';

type SideSheetProps = {
  title: string;
  size?: 'narrow' | 'wide';
  isDirty?: () => boolean;
  onClose: () => void;
  footer?: (requestClose: () => void) => ReactNode;
  children: ReactNode;
};

export const SideSheet = (props: SideSheetProps) => {
  const { translate } = useContext(I18nContext);
  const { confirm } = useContext(ModalContext);
  const titleId = useId();

  const requestClose = () => {
    if (!props.isDirty?.()) {
      props.onClose();
      return;
    }

    confirm({
      message: translate('side.sheet.unsaved.changes.message'),
      okLabel: translate('side.sheet.unsaved.changes.leave'),
      cancelLabel: translate('side.sheet.unsaved.changes.stay'),
    }).then((leave) => leave && props.onClose());
  };

  return createPortal(
    <div className="side-sheet-container">
      <div className="side-sheet-backdrop" aria-hidden="true" onClick={requestClose} />

      <section
        className={classNames('side-sheet', `--${props.size ?? 'narrow'}`)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(e) => {
          const inOpenMenu = (e.target as HTMLElement).getAttribute('aria-expanded') === 'true';

          if (e.key === 'Escape' && !inOpenMenu) {
            e.stopPropagation();
            requestClose();
          }
        }}
      >
        <header className="side-sheet__header">
          <h2 id={titleId} className="side-sheet__title">
            {props.title}
          </h2>
          <button
            type="button"
            autoFocus
            className="btn --ghost --icon-only"
            aria-label={translate('Close')}
            onClick={requestClose}
          >
            <X size={20} />
          </button>
        </header>

        <div className="side-sheet__body">{props.children}</div>

        {props.footer && <footer className="side-sheet__footer">{props.footer(requestClose)}</footer>}
      </section>
    </div>,
    document.body
  );
};

type SideSheetActionsProps = {
  onCancel: () => void;
  onSave: () => void;
  saveLabel?: string;
  saveDisabled?: boolean;
};

export const SideSheetActions = (props: SideSheetActionsProps) => {
  const { translate } = useContext(I18nContext);

  return (
    <>
      <button type="button" className="btn --secondary" onClick={props.onCancel}>
        {translate('Cancel')}
      </button>
      <button type="button" className="btn --primary" disabled={props.saveDisabled} onClick={props.onSave}>
        {props.saveLabel ?? translate('Save')}
      </button>
    </>
  );
};
