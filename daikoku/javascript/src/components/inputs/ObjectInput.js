import React, { Component } from 'react';
import { Help } from './Help';

export class ObjectInput extends Component {
  changeValue = (e, name) => {
    if (e && e.preventDefault) e.preventDefault();
    const newValues = { ...this.props.value, [name]: e.target.value };
    this.props.onChange(newValues);
  };

  changeKey = (e, oldName) => {
    if (e && e.preventDefault) e.preventDefault();
    const newValues = { ...this.props.value };
    const oldValue = newValues[oldName];
    delete newValues[oldName];
    newValues[e.target.value] = oldValue;
    this.props.onChange(newValues);
  };

  addFirst = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!this.props.value || Object.keys(this.props.value).length === 0) {
      this.props.onChange(this.props.defaultValue || { '': '' });
    }
  };

  addNext = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const newItem = this.props.defaultValue || { '': '' };
    const newValues = { ...this.props.value, ...newItem };
    this.props.onChange(newValues);
  };

  remove = (e, name) => {
    if (e && e.preventDefault) e.preventDefault();
    const newValues = { ...this.props.value };
    delete newValues[name];
    this.props.onChange(newValues);
  };

  render() {
    const values = Object.keys(this.props.value || {}).map((k) => [k, this.props.value[k]]);
    return (
      <div>
        {values.length === 0 && (
          <div className="form-group row">
            <label
              htmlFor={`input-${this.props.label}`}
              className="col-xs-12 col-sm-2 col-form-label">
              <Help text={this.props.help} label={this.props.label} />
            </label>
            <div className="col-sm-10">
              <button
                disabled={this.props.disabled}
                type="button"
                className="btn btn-outline-primary"
                onClick={this.addFirst}>
                <i className="fas fa-plus" />{' '}
              </button>
            </div>
          </div>
        )}
        {values.map((value, idx) => (
          <div key={`form-group-${idx}`} className="row mb-2">
            {idx === 0 && this.props.label && (
              <label className="col-xs-12 col-sm-2 col-form-label">
                <Help text={this.props.help} label={this.props.label} />
              </label>
            )}
            {idx > 0 && this.props.label && (
              <label className="col-xs-12 col-sm-2 col-form-label">&nbsp;</label>
            )}
            <div className={`col-sm-${this.props.label ? '10' : '12'}`}>
              <div className="input-group">
                <input
                  disabled={this.props.disabled}
                  type="text"
                  className="form-control"
                  placeholder={this.props.placeholderKey}
                  value={value[0]}
                  onChange={(e) => this.changeKey(e, value[0])}
                />
                <input
                  disabled={this.props.disabled}
                  type="text"
                  className="form-control"
                  placeholder={this.props.placeholderValue}
                  value={value[1]}
                  onChange={(e) => this.changeValue(e, value[0])}
                />
                <span className="input-group-append">
                  <button
                    disabled={this.props.disabled}
                    type="button"
                    className="btn btn-outline-danger"
                    onClick={(e) => this.remove(e, value[0])}>
                    <i className="fas fa-trash" />
                  </button>
                  {idx === values.length - 1 && (
                    <button
                      disabled={this.props.disabled}
                      type="button"
                      className="btn btn-outline-primary"
                      onClick={this.addNext}>
                      <i className="fas fa-plus" />{' '}
                    </button>
                  )}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }
}

export class VerticalObjectInput extends Component {
  changeValue = (e, name) => {
    if (e && e.preventDefault) e.preventDefault();
    const newValues = { ...this.props.value, [name]: e.target.value };
    this.props.onChange(newValues);
  };

  changeKey = (e, oldName) => {
    if (e && e.preventDefault) e.preventDefault();
    const newValues = { ...this.props.value };
    const oldValue = newValues[oldName];
    delete newValues[oldName];
    newValues[e.target.value] = oldValue;
    this.props.onChange(newValues);
  };

  addFirst = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!this.props.value || Object.keys(this.props.value).length === 0) {
      this.props.onChange(this.props.defaultValue || { '': '' });
    }
  };

  addNext = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const newItem = this.props.defaultValue || { '': '' };
    const newValues = { ...this.props.value, ...newItem };
    this.props.onChange(newValues);
  };

  remove = (e, name) => {
    if (e && e.preventDefault) e.preventDefault();
    const newValues = { ...this.props.value };
    delete newValues[name];
    this.props.onChange(newValues);
  };

  render() {
    const values = Object.keys(this.props.value || {}).map((k) => [k, this.props.value[k]]);
    return (
      <div>
        {values.length === 0 && (
          <div className="form-group row">
            <div className="col-xs-12">
              <label htmlFor={`input-${this.props.label}`} className="col-form-label">
                <Help text={this.props.help} label={this.props.label} />
              </label>
              <div>
                <button
                  disabled={this.props.disabled}
                  type="button"
                  className="btn btn-primary"
                  onClick={this.addFirst}>
                  <i className="fas fa-plus" />{' '}
                </button>
              </div>
            </div>
          </div>
        )}
        {values.map((value, idx) => (
          <div
            key={`from-group-${idx}`}
            className="form-group row"
            style={{ marginBottom: 5, flexWrap: 'nowrap' }}>
            <div className="col-xs-12">
              {idx === 0 && (
                <label className="col-form-label">
                  <Help text={this.props.help} label={this.props.label} />
                </label>
              )}
              {idx > 0 && false && <label className="col-form-label">&nbsp;</label>}
              <div className="input-group">
                <input
                  disabled={this.props.disabled}
                  type="text"
                  className="form-control"
                  style={{ width: '50%' }}
                  placeholder={this.props.placeholderKey}
                  value={value[0]}
                  onChange={(e) => this.changeKey(e, value[0])}
                />
                <input
                  disabled={this.props.disabled}
                  type="text"
                  className="form-control"
                  style={{ width: '50%' }}
                  placeholder={this.props.placeholderValue}
                  value={value[1]}
                  onChange={(e) => this.changeValue(e, value[0])}
                />
                <span className="btn-group">
                  <button
                    disabled={this.props.disabled}
                    type="button"
                    className="btn btn-sm btn-danger"
                    style={{ marginRight: 0 }}
                    onClick={(e) => this.remove(e, value[0])}>
                    <i className="fas fa-trash" />
                  </button>
                </span>
              </div>
              {idx === values.length - 1 && (
                <div
                  style={{
                    display: 'flex',
                    width: '100%',
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginTop: 5,
                  }}>
                  <button
                    disabled={this.props.disabled}
                    type="button"
                    className="btn btn-sm btn-block btn-primary"
                    style={{ marginRight: 0 }}
                    onClick={this.addNext}>
                    <i className="fas fa-plus" />{' '}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }
}
