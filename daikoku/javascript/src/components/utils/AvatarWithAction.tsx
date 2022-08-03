import React, { useState, useEffect } from 'react';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'uuid... Remove this comment to see the full error message
import { v4 as uuidv4 } from 'uuid';
import ReactToolTip from 'react-tooltip';

type Props = {
    avatar: string;
    infos?: string | React.ReactElement;
    actions?: {
        action?: ((...args: any[]) => any) | any[];
        link?: string;
        iconClass: string;
        tooltip?: string;
    }[];
};

export const AvatarWithAction = (props: Props) => {
  const [secondaryActions, setSecondaryActions] = useState([]);

  useEffect(() => {
    ReactToolTip.rebuild();
  }, [secondaryActions]);

  const handleAction = (action: any) => {
    if (secondaryActions.length) {
      ReactToolTip.hide();
      setSecondaryActions([]);
    }
    action();
  };

  const getAction = (action: any, idx: any) => {
    const uuid = uuidv4();
    let ActionComponent;

    if (Array.isArray(action.action)) {
      ActionComponent = (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <span>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <i
            className={action.iconClass}
            onClick={() => {
              ReactToolTip.hide();
              setSecondaryActions(action.action);
            }}
          />
        </span>
      );
    } else if (action.link) {
      ActionComponent = (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <a href={action.link}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <i className={action.iconClass} onClick={() => handleAction(action.action)} />
        </a>
      );
    } else if (action.redirect) {
      ActionComponent = (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <span onClick={() => action.redirect()}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <i className={action.iconClass} />
        </span>
      );
    } else {
      ActionComponent = (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <i className={action.iconClass} onClick={() => handleAction(action.action)} />
      );
    }

    if (action.tooltip) {
      return (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <span className="avatar-with-action__action" key={uuid}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <span data-tip={action.tooltip}>{ActionComponent}</span>
        </span>
      );
    }
    return (
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <span className="avatar-with-action__action" key={uuid}>
        {ActionComponent}
      </span>
    );
  };

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="avatar-with-action">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="container">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="overlay" />
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <ReactToolTip place={'bottom'} />
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="avatar__container">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <img src={props.avatar} alt="avatar" className="avatar-with-action__avatar" />
        </div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="avatar-with-action__infos">{props.infos}</div>
        {/* @ts-expect-error TS(2532): Object is possibly 'undefined'. */}
        {!secondaryActions.length && props.actions.map((action, idx) => getAction(action, idx))}
        {!!secondaryActions.length && secondaryActions.map((action, idx) => getAction(action, idx))}
      </div>
    </div>
  );
};
