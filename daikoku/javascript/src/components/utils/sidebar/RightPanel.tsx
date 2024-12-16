import classNames from 'classnames';
import { useContext, useEffect } from 'react';
import ArrowRight from 'react-feather/dist/icons/arrow-right';

import { I18nContext, ModalContext } from '../../../contexts';


export const RightPanel = () => {
  const { rightPanelContent, closeRightPanel } = useContext(ModalContext);
  const { translate } = useContext(I18nContext);


  useEffect(() => {
    closeRightPanel();
  }, [location]);

  const closeOnEsc = (e: any) => {
    if (e.key == 'Escape' || e.key == 'Esc') {
      e.preventDefault();
      closeRightPanel();
      return false;
    }
  };
  useEffect(() => {
    window.addEventListener('keydown', closeOnEsc, true);

    return () => {
      window.removeEventListener('keydown', closeOnEsc, true);
    };
  }, []);

  return (
    <div className="right-panel-container">
      <div
        className={classNames('right-panel', {
          opened: rightPanelContent,
          closed: !rightPanelContent,
        })}
      >
        <div className="m-2 p-2 ">
          <div
            className="cursor-pointer right-panel__back d-flex align-items-center justify-content-center companion-link"
            onClick={closeRightPanel}
            aria-label={translate("right.panel.close.aria.label")} >
            <ArrowRight />
          </div>
          {rightPanelContent?.title}
        </div>
        <div className="m-2 p-2">
          {rightPanelContent?.content}
        </div>
      </div>
      <div
        className={classNames('right-panel-background', {
          opened: rightPanelContent,
          closed: !rightPanelContent,
        })}
        onClick={closeRightPanel}
      />
    </div>
  );
};
