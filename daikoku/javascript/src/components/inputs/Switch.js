import React, { Component } from 'react';
import { PropTypes } from 'prop-types';
import classNames from 'classnames';
import uuidv4 from 'uuid/v4';

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
    const { className, label } = this.props;
    const id = label ? label.replace(/\s/gi, '') : uuidv4();
    return (
      <div
        className={classNames({
          'switch--loading': this.state.loading,
          'switch--loaded': !this.state.loading,
        })}>
        <label
          className={classNames('switch--item', {
            ...className,
          })}
          htmlFor={id}>
          <div className="switch__label">{label}</div>
          <input
            type="checkbox"
            id={id}
            ref={ref => (this.switch = ref)}
            checked={this.props.checked}
            style={{ display: 'none' }}
            onChange={() => this.notifySwitch()}
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
};
