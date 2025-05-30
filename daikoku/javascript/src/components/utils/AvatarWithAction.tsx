import React, { useState, useEffect } from 'react';
import { Tooltip as ReactToolTip } from 'react-tooltip';
import { nanoid } from 'nanoid';
import { BeautifulTitle } from './BeautifulTitle';

type Props = {
  avatar: string;
  infos?: string | React.ReactElement;
  actions: {
    action?: ((...args: any[]) => any) | any[];
    redirect?: () => void,
    link?: string;
    iconClass: string;
    tooltip?: string;
  }[];
};

export const AvatarWithAction = (props: Props) => {
  const [secondaryActions, setSecondaryActions] = useState([]);

  useEffect(() => {
    // ReactToolTip.rebuild();
  }, [secondaryActions]);

  const handleAction = (action: any) => {
    if (secondaryActions.length) {
      // ReactToolTip.hide();
      setSecondaryActions([]);
    }
    action();
  };

  const getAction = (action: any, idx: any) => {
    const uuid = nanoid();
    let ActionComponent;

    if (Array.isArray(action.action)) {
      ActionComponent = (
        <span>
          <i
            className={action.iconClass}
            onClick={() => {
              // ReactToolTip.hide();
              setSecondaryActions(action.action);
            }}
          />
        </span>
      );
    } else if (action.link) {
      ActionComponent = (
        <a href={action.link} aria-label={action.ariaLabel}>
          <i className={action.iconClass} onClick={() => handleAction(action.action)} />
        </a>
      );
    } else if (action.redirect) {
      ActionComponent = (
        <span onClick={() => action.redirect()} aria-label={action.ariaLabel}>
          <i className={action.iconClass} />
        </span>
      );
    } else {
      ActionComponent = (
        <i className={action.iconClass} onClick={() => handleAction(action.action)} aria-label={action.ariaLabel} />
      );
    }

    if (action.tooltip) {
      return (
        <BeautifulTitle variant={action.variant} title={action.tooltip} key={uuid} className='avatar-with-action__action'>
          {ActionComponent}
        </BeautifulTitle>
      );
    }
    return (
      <span className="avatar-with-action__action" key={uuid}>
        {ActionComponent}
      </span>
    );
  };

  const id = nanoid()
  return (
    <div className="avatar-with-action" role='listitem' aria-labelledby={id}>
      <div className="container">
        <div className="overlay" />
        <div className="avatar__container">
          <img src={props.avatar} alt="avatar" className="avatar-with-action__avatar" />
        </div>
        <div className="avatar-with-action__infos" id={id}>{props.infos}</div>
        {!secondaryActions.length && props.actions.map((action, idx) => getAction(action, idx))}
        {!!secondaryActions.length && secondaryActions.map((action, idx) => getAction(action, idx))}
      </div>
    </div>
  );
};
