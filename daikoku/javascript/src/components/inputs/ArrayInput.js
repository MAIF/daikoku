import React, { Component } from 'react';
import Select from 'react-select';
import CreatableSelect from 'react-select/creatable';
import { Help } from './Help';
import { t } from '../../locales';

const valueToSelectOption = (value) => {
  if (value === null) {
    return null;
  }
  return {
    label: value.label || value,
    value: value.value || value,
  };
};

export class ArrayInput extends Component {
  state = {
    loading: false,
    values: [],
    value: (this.props.value || []).map(valueToSelectOption),
    inputValue: '',
  };

  componentDidMount() {
    if (this.props.valuesFrom) {
      this.reloadValues(this.props.valuesFrom);
    }
  }

  reloadValues = (from) => {
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
      .then((values) =>
        this.setState({
          values,
          value: values.filter((v) => this.props.value.includes(v.value)),
          loading: false,
        })
      );
  };

  UNSAFE_componentWillReceiveProps(nextProps) {
    if (nextProps.valuesFrom !== this.props.valuesFrom) {
      this.reloadValues(nextProps.valuesFrom);
    }
    if (nextProps.valuesFrom && nextProps.value !== this.props.value) {
      this.reloadValues().then(() => {
        if (!this.props.creatable) {
          this.setState({
            value: this.state.values.filter((v) => nextProps.value.includes(v.value)),
          });
        } else {
          this.setState({ value: (nextProps.value || []).map(valueToSelectOption) });
        }
      });
    }

    if (!nextProps.valuesFrom && nextProps.value !== this.props.value) {
      this.setState({ value: (nextProps.value || []).map(valueToSelectOption) });
    }
  }

  changeValue = (e) => {
    if (e) {
      if (e.some((item) => item.__isNew__)) {
        const newVals = e.filter((item) => item.__isNew__);
        this.setState({ value: e, values: [...this.state.values, ...newVals] });
      } else {
        this.setState({ value: e });
        const finaItem = (item) =>
          this.props.transformSet ? this.props.transformSet(item.value) : item.value;
        this.props.onChange(e.map(finaItem));
      }
    } else {
      this.setState({ value: null });
      this.props.onChange(null);
    }
  };

  handleInputChange = (inputValue) => {
    this.setState({ inputValue });
  };

  handleKeyDown = (event) => {
    const { inputValue, value } = this.state;
    if (!inputValue) return;

    const newValue = [...value, { label: inputValue, value: inputValue }];
    const finaItem = (item) =>
      this.props.transformSet ? this.props.transformSet(item.value) : item.value;
    switch (event.key) {
      case 'Enter':
      case 'Tab':
        this.setState(
          {
            inputValue: '',
            value: newValue,
          },
          () => this.props.onChange(newValue.map(finaItem))
        );
        event.preventDefault();
    }
  };

  render() {
    const placeholder = t('array.input.placeholder', this.props.currentLanguage || 'En');
    return (
      <div>
        <div className="form-group row" style={{ marginBottom: 15 }}>
          <label
            htmlFor={`input-${this.props.label}`}
            className="col-xs-12 col-sm-2 col-form-label">
            <Help text={this.props.help} label={this.props.label} />
          </label>
          <div className="col-sm-10">
            <div style={{ width: '100%' }}>
              {!this.props.valuesFrom && !this.props.creatable && (
                <CreatableSelect
                  isDisabled={this.props.disabled}
                  components={{ DropdownIndicator: null }}
                  inputValue={this.state.inputValue}
                  isClearable
                  isMulti
                  menuIsOpen={false}
                  onChange={this.changeValue}
                  onInputChange={this.handleInputChange}
                  onKeyDown={this.handleKeyDown}
                  options={this.props.options}
                  placeholder={placeholder}
                  value={this.state.value}
                  className="input-select reactSelect"
                  classNamePrefix="reactSelect"
                />
              )}
              {!!this.props.valuesFrom && this.props.creatable && (
                <CreatableSelect
                  isDisabled={this.props.disabled}
                  components={{ DropdownIndicator: null }}
                  inputValue={this.state.inputValue}
                  isClearable
                  isMulti
                  onChange={this.changeValue}
                  onInputChange={this.handleInputChange}
                  onKeyDown={this.handleKeyDown}
                  options={this.state.values}
                  placeholder={placeholder}
                  value={this.state.value}
                />
              )}
              {!!this.props.valuesFrom && !this.props.creatable && (
                <Select
                  name={`${this.props.label}-selector`}
                  className={this.props.selectClassName}
                  value={this.state.value}
                  isLoading={this.state.loading}
                  isMulti
                  isDisabled={this.props.disabled}
                  placeholder={this.props.placeholder}
                  options={this.state.values}
                  onChange={this.changeValue}
                  classNamePrefix="reactSelect"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
}
