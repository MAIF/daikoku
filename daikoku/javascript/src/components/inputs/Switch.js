import React, { Component } from 'react';
import { PropTypes } from 'prop-types';
import classNames from 'classnames';
import { v4 as uuidv4 } from 'uuid';

export class SwitchButton extends Component {
  state = {
    loading: false,
  };

  notifySwitch = () => {
    const checked = this.switch.checked;
    if (this.props.onSwitch) {
      this.setState({ loading: true }, () => {
        const action = this.props.onSwitch(checked);
        if (action instanceof Promise) {
          Promise.resolve(action).then(() => this.setState({ loading: false }));
        } else {
          this.setState({ loading: false });
        }
      });
    }
  };

  render() {
    const { label } = this.props;
    const id = label ? label.replace(/\s/gi, '') : uuidv4();
    return (
      <div
        className={classNames('d-flex justify-content-center ', {
          'switch--loading': this.state.loading,
          'switch--loaded': !this.state.loading,
          'switch--disabled': this.props.disabled,
        })}>
        <label className="switch--item" htmlFor={id}>
          {label && <div className="switch__label">{label}</div>}
          <input
            type="checkbox"
            id={id}
            ref={(ref) => (this.switch = ref)}
            checked={this.props.checked}
            style={{ display: 'none' }}
            onChange={() => this.notifySwitch()}
            disabled={this.props.disabled}
          />
          <span className="slider round" />
        </label>
      </div>
    );
  }
}

SwitchButton.propTypes = {
  className: PropTypes.string,
  label: PropTypes.string,
  onSwitch: PropTypes.func,
  checked: PropTypes.bool,
  disabled: PropTypes.bool,
};
