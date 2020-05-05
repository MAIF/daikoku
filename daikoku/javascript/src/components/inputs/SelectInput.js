import React, { Component } from 'react';
import Select from 'react-select';
import { Help } from './Help';

const valueToSelectOption = (value) => {
  if (value === null) {
    return null;
  }
  return {
    label: value.label || value,
    value: value.value || value,
  };
};

export class SelectInput extends Component {
  state = {
    error: null,
    loading: false,
    value: valueToSelectOption(this.props.value),
    values: (this.props.possibleValues || []).map(valueToSelectOption),
  };

  componentDidMount() {
    if (this.props.valuesFrom) {
      this.reloadValues();
    } else {
      this.setState({
        value: this.state.values.find((item) => item.value === this.state.value.value),
      });
    }
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    if (nextProps.valuesFrom !== this.props.valuesFrom) {
      this.reloadValues(nextProps.valuesFrom);
    }
    if (nextProps.valuesFrom && nextProps.value !== this.props.value) {
      this.reloadValues().then(() => {
        this.setState({ value: this.state.values.find((v) => v.value === nextProps.value) });
      });
    }
    if (nextProps.possibleValues !== this.props.possibleValues) {
      this.setState({
        values: (nextProps.possibleValues || []).map(valueToSelectOption),
      });
    }
    if (!nextProps.valuesFrom && nextProps.value !== this.props.value) {
      this.setState({ value: this.state.values.find((v) => v.value === nextProps.value) });
    }
  }

  componentDidCatch(error) {
    console.log('SelectInput catches error', error, this.state);
    this.setState({ error });
  }

  reloadValues = (from) => {
    const cond = this.props.fetchCondition ? this.props.fetchCondition() : true;

    if (cond) {
      this.setState({ loading: true });
      return fetch(from || this.props.valuesFrom, {
        method: 'GET',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
        },
      })
        .then((r) => r.json())
        .then((values) => values.map(this.props.transformer || ((a) => a)))
        .then((values) => {
          return this.setState({
            values,
            value:
              values.find(
                (item) =>
                  item.value === (this.state.value ? this.state.value.value : this.state.value)
              ) || null,
            loading: false,
          });
        });
    }
  };

  onChange = (e) => {
    if (e) {
      this.setState({ value: e });
      this.props.onChange(e.value);
    } else {
      this.setState({ value: null });
      this.props.onChange(null);
    }
  };

  onChangeClassic = (e) => {
    this.setState({ value: e.target.value });
    this.props.onChange(e.target.value);
  };

  render() {
    if (this.state.error) {
      return (
        <div className="form-group row">
          <label
            htmlFor={`input-${this.props.label}`}
            className="col-xs-12 col-sm-2 col-form-label">
            {this.props.label} <Help text={this.props.help} />
          </label>
          <div className="col-sm-10">
            <div style={{ width: '100%' }}>
              <span>{this.state.error.message ? this.state.error.message : this.state.error}</span>
            </div>
          </div>
        </div>
      );
    }
    if (this.props.classic && !this.props.disabled) {
      return (
        <div className="form-group row">
          <label
            htmlFor={`input-${this.props.label}`}
            className="col-xs-12 col-sm-2 col-form-label">
            {this.props.label} <Help text={this.props.help} />
          </label>
          <div className="col-sm-10">
            <div style={{ width: '100%' }}>
              <select
                className="form-control classic-select"
                value={this.state.value}
                onChange={this.onChangeClassic}>
                {this.state.values.map((value, idx) => (
                  <option key={idx} value={value.value}>
                    {value.label}
                  </option>
                ))}
                classNamePrefix="reactSelect"
              </select>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="form-group row">
        <label htmlFor={`input-${this.props.label}`} className="col-xs-12 col-sm-2 col-form-label">
          {this.props.label} <Help text={this.props.help} />
        </label>
        <div className="col-sm-10">
          <div style={{ width: '100%' }} className="input-select">
            <Select
              style={{ width: this.props.more ? '100%' : '100%' }}
              name={`${this.props.label}-search`}
              isLoading={this.state.loading}
              value={this.state.value}
              isDisabled={this.props.disabled}
              placeholder={this.props.placeholder}
              options={this.state.values}
              onChange={this.onChange}
              classNamePrefix="reactSelect"
              className="reactSelect"
            />
          </div>
        </div>
      </div>
    );
  }
}
