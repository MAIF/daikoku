import React from 'react';

export const LinkDisplay = (props) => (
  <div className="form-group row">
    <label className="col-sm-2 control-label" />
    <div className="col-sm-10">
      <i className="fas fa-share" />{' '}
      <a href={props.link} target="_blank" rel="noopener noreferrer">
        {props.link}
      </a>
    </div>
  </div>
);
