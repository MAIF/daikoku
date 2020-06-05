import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import { v4 as uuidv4 } from 'uuid';
import ReactToolTip from 'react-tooltip';

const placements = ['topRight', 'topLeft', 'bottomRight', 'bottomLeft'];

export const AvatarWithAction = (props) => {
  const [secondaryActions, setSecondaryActions] = useState([]);

  const handleAction = (action) => {
    if (secondaryActions.length) {
      setSecondaryActions([]);
    }
    action();
  };

  const getAction = (action, idx) => {
    const uuid = uuidv4();
    let ActionComponent;

    if (Array.isArray(action.action)) {
      ActionComponent = (
          <Link to={action.link}>
            <i className={action.iconClass} onClick={() => setSecondaryActions(action.action)} />
          </Link>
      );
    } else if (action.link) {
      ActionComponent = (
          <a href={action.link}>
            <i className={action.iconClass} onClick={() => handleAction(action.action)} />
          </a>
      );
    } else if (action.redirect) {
      ActionComponent = (
          <span onClick={() => action.redirect()}>
            <i className={action.iconClass} />
          </span>
      );
    } else {
      ActionComponent = (
          <i className={action.iconClass} onClick={() => handleAction(action.action)} />
      );
    }

    if (action.tooltip) {
      return (
        <span className="avatar-with-action__action" key={uuid}>
          <span data-tip={action.tooltip}>{ActionComponent}</span>
        </span>
      );
    }
    return (
      <span className="avatar-with-action__action" key={uuid}>
        {ActionComponent}
      </span>
    );
  };

  return (
    <div className="avatar-with-action">
      <div className="container">
        <div className="overlay" />
        <ReactToolTip place={'bottom'} />
        <div className="avatar-with-action__container">
          <img src={props.avatar} alt="avatar" className="avatar-with-action__avatar" />
        </div>
        <div className="avatar-with-action__infos">{props.infos}</div>
        {!secondaryActions.length && props.actions.map((action, idx) => getAction(action, idx))}
        {!!secondaryActions.length && secondaryActions.map((action, idx) => getAction(action, idx))}
      </div>
    </div>
  );
};

AvatarWithAction.propTypes = {
  avatar: PropTypes.string.isRequired,
  infos: PropTypes.oneOfType([PropTypes.string, PropTypes.element]),
  actions: PropTypes.arrayOf(
    PropTypes.shape({
      action: PropTypes.oneOfType([PropTypes.func, PropTypes.array]),
      link: PropTypes.string,
      iconClass: PropTypes.string.isRequired,
      tooltip: PropTypes.string,
    })
  ),
};
