import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import { Tooltip } from 'antd';
import uuidv4 from 'uuid/v4';

const placements = ['topRight', 'topLeft', 'bottomRight', 'bottomLeft'];

export const AvatarWithAction = props => {
  const [secondaryActions, setSecondaryActions] = useState([]);

  const handleAction = action => {
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
        <span className="avatar-with-action__action" key={uuid}>
          <Link to={action.link}>
            <i className={action.iconClass} onClick={() => setSecondaryActions(action.action)} />
          </Link>
        </span>
      );
    } else if (action.link) {
      ActionComponent = (
        <span className="avatar-with-action__action" key={uuid}>
          <a href={action.link}>
            <i className={action.iconClass} onClick={() => handleAction(action.action)} />
          </a>
        </span>
      );
    } else if (action.redirect) {
      ActionComponent = (
        <span className="avatar-with-action__action" key={uuid}>
          <span onClick={() => action.redirect()}>
            <i className={action.iconClass} />
          </span>
        </span>
      );
    } else {
      ActionComponent = (
        <span className="avatar-with-action__action" key={uuid}>
          <i className={action.iconClass} onClick={() => handleAction(action.action)} />
        </span>
      );
    }

    if (action.tooltip) {
      return (
        <Tooltip key={uuid} placement={placements[idx]} title={action.tooltip}>
          {ActionComponent}
        </Tooltip>
      );
    }
    return ActionComponent;
  };

  return (
    <div className="avatar-with-action">
      <div className="container">
        <div className="overlay" />
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
