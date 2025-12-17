import classNames from 'classnames';
import { useContext, useEffect } from 'react';
import X from 'react-feather/dist/icons/x';

import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useLocation } from 'react-router-dom';
import { ModalContext } from '../../../contexts';


export const RightPanel = () => {
  const { rightPanelContent, closeRightPanel } = useContext(ModalContext);

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
  }, [closeRightPanel]);

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
