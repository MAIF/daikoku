import classNames from 'classnames';
import { useContext, useEffect, useRef } from 'react';
import X from 'react-feather/dist/icons/x';

import { I18nContext, ModalContext } from '../../../contexts';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useLocation } from 'react-router-dom';


export const RightPanel = () => {
  const { rightPanelContent, closeRightPanel } = useContext(ModalContext);
  const { translate } = useContext(I18nContext);
  const location = useLocation();


  useEffect(() => {
    closeRightPanel();

    return () => {
      closeRightPanel()
    };
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
    <div className={classNames("right-panel-container", { opened: rightPanelContent })}>
      <PanelGroup direction='horizontal'>
        <Panel defaultSize={25} maxSize={65}>
          <div
            className={classNames('right-panel-background', {
              opened: rightPanelContent,
              closed: !rightPanelContent,
            })}
            onClick={closeRightPanel}
          />

        </Panel>
        <PanelResizeHandle />
        <Panel defaultSize={75} minSize={35}>
          <div
            className={classNames('right-panel', {
              opened: rightPanelContent,
              closed: !rightPanelContent,
            })}
          >
            <div className="m-2 p-2 ">
              <div className="cursor-pointer right-panel__back d-flex align-items-center justify-content-center companion-link">
                <X className="" onClick={closeRightPanel} />
              </div>
              {rightPanelContent?.title}
            </div>
            <div className="m-2 p-2">
              {rightPanelContent?.content}
            </div>
          </div>
        </Panel>
      </PanelGroup>

    </div>
  );
};
