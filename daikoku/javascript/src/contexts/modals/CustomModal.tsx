
import { IModalProps } from './ApiSelectModal';
import { IBaseModalProps } from './types';

/**
 * draw a custom modal
 * contains just a header with title
 * 
 * beware of adding modal footer in the content if you want it
 * use close from modalContext to close the currentModal
 * 
 * ex: 
 * <>
 *  <div className="modal-body">
        {content}
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-outline-danger" onClick={() => close()}>
          {translate('Cancel')}
        </button>
        <button type="button" className="btn btn-outline-success" onClick={() => actionAndClose()}>
          {actionLabel}
        </button>
      </div>
 * </>
 * 
 */
export interface ICustomModalProps extends IModalProps {
  actions?: (close) => JSX.Element
}
export const CustomModal = ({
  title,
  content,
  close,
  actions
}: ICustomModalProps & IBaseModalProps) => {


  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title">{title}</h5>
        <button type="button" className="btn-close" aria-label="Close" onClick={() => close()} />
      </div>
      {content}
      {actions && (
        <div className="modal-footer">
          {actions(close)}
        </div>
      )}
    </div>
  );
};
