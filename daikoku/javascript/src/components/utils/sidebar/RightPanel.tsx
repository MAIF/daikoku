import classNames from 'classnames';
import { useContext, useEffect } from 'react';
import { X } from 'lucide-react';
import { Panel, Group, Separator } from 'react-resizable-panels';

import { ModalContext } from '../../../contexts';


export const RightPanel = () => {
  const { rightPanelContent, closeRightPanel } = useContext(ModalContext);

  useEffect(() => {
    const closeOnEsc = (e: any) => {
      if (e.key == 'Escape' || e.key == 'Esc') {
        e.preventDefault();
        closeRightPanel();
        return false;
      }
    };

    window.addEventListener('keydown', closeOnEsc, true);

    return () => {
      window.removeEventListener('keydown', closeOnEsc, true);
    };
  }, [closeRightPanel]);

  useEffect(() => {
    if (rightPanelContent) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [rightPanelContent]);

  return (
    <div className={classNames("right-panel-container", { opened: rightPanelContent })}>
      <Group orientation='horizontal'>
        <Panel defaultSize={25} maxSize={65}>
          <div
            className={classNames('right-panel-background', {
              opened: rightPanelContent,
              closed: !rightPanelContent,
            })}
            onClick={closeRightPanel}
          />

        </Panel>
        <Separator />
        <Panel defaultSize={75} minSize={35}>
          <div
            className={classNames('right-panel', {
              opened: rightPanelContent,
              closed: !rightPanelContent,
            })}
          >
            <div className="m-2 p-2">
              <button className="btn --icon-only --secondary right-panel__back " onClick={closeRightPanel}>
                <X />
              </button>
              {rightPanelContent?.title}
            </div>
            <div className="m-2 p-2 flex-grow-1 overflow-y-auto">
              {rightPanelContent?.content}
            </div>
          </div>
        </Panel>
      </Group>

    </div>
  );
};
