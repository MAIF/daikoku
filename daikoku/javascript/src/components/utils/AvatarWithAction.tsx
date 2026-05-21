import { nanoid } from 'nanoid';
import React, {ReactNode, useEffect, useState} from 'react';
import { BeautifulTitle } from './BeautifulTitle';

import { IUserSimple } from '../../types';

type Props = {
  avatar?: string;
  name: string;
  infos?: string | React.ReactElement;
  actions: {
    action?: ((...args: any[]) => any) | any[];
    redirect?: () => void,
    link?: string;
    icon: ReactNode;
    tooltip?: string;
  }[];
};

export const userHasAvatar = (user: IUserSimple) => user.isGuest || !user.picture?.includes('anonymous')

export const getInitials = (fullName: string): string | undefined => {
  if (!fullName) return "";

  const parts = fullName.trim().split(/\s+/);

  if (parts.length === 0) return;
  if (parts.length === 1) {
    return parts[0][0].toUpperCase();
  }

  const first = parts[0][0].toUpperCase();
  const last = parts[parts.length - 1][0].toUpperCase();

  return first + last;
}

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

  const getAction = (action: any) => {
    const uuid = nanoid();
    let ActionComponent;

    if (Array.isArray(action.action)) {
      ActionComponent = (
        <span>
          {React.cloneElement(action.icon, { onClick: () => setSecondaryActions(action.action) })}
        </span>
      );
    } else if (action.link) {
      ActionComponent = (
        <a href={action.link} target='_blank' aria-label={action.ariaLabel}>
          {React.cloneElement(action.icon, { onClick: () => handleAction(action.action) })}
        </a>
      );
    } else if (action.redirect) {
      ActionComponent = (
        <span onClick={() => action.redirect()} aria-label={action.ariaLabel}>
          {action.icon}
        </span>
      );
    } else {
      ActionComponent = (
        <a href={action.link} target='_blank' aria-label={action.ariaLabel}>
          {React.cloneElement(action.icon, { onClick: () => handleAction(action.action) })}
        </a>
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
          {props.avatar?.includes('anonymous') || !props.avatar && <div className="avatar-with-action__avatar avatar-without-img" >{getInitials(props.name)}</div>}
          {!props.avatar?.includes('anonymous') && !!props.avatar && <img src={props.avatar} alt="avatar" className="avatar-with-action__avatar" />}
        </div>
        <div className="avatar-with-action__infos" id={id}>{props.infos}</div>
        {!secondaryActions.length && props.actions.map((action) => getAction(action))}
        {!!secondaryActions.length && secondaryActions.map((action) => getAction(action))}
      </div>
    </div>
  );
};
