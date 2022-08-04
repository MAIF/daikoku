import React, { Component } from 'react';
import Select from 'react-select';
import { Help } from './Help';
import { Option } from '../utils';

const valueToSelectOption = (value: any) => {
  if (value === null) {
    return null;
  }
  return {
    label: value.label || value,
    value: value.value || value,
  };
};

type SelectInputState = any;

export class SelectInput extends Component<{}, SelectInputState> {
  state = {
    error: null,
    loading: false,
    value: Option((this.props as any).possibleValues)
        .map((maybeValues: any) => maybeValues.find((v: any) => v.value === (this.props as any).value))
        .getOrElse(valueToSelectOption((this.props as any).value)),
    values: ((this.props as any).possibleValues || []).map(valueToSelectOption),
};

  componentDidMount() {
    if ((this.props as any).valuesFrom) {
            this.reloadValues();
    } else {
      this.setState({
        value: this.state.values.find((item: any) => item.value === this.state.value.value),
      });
    }
  }

  UNSAFE_componentWillReceiveProps(nextProps: any) {
    if (nextProps.valuesFrom !== (this.props as any).valuesFrom) {
      this.reloadValues(nextProps.valuesFrom);
    }
    if (nextProps.valuesFrom && nextProps.value !== (this.props as any).value) {
            this.reloadValues().then(() => {
        this.setState({ value: this.state.values.find((v: any) => v.value === nextProps.value) });
      });
    }
    if (nextProps.possibleValues !== (this.props as any).possibleValues) {
      this.setState({
        values: (nextProps.possibleValues || []).map(valueToSelectOption),
      });
    }
    if (!nextProps.valuesFrom && nextProps.value !== (this.props as any).value) {
      this.setState({ value: this.state.values.find((v: any) => v.value === nextProps.value) });
    }
  }

  componentDidCatch(error: any) {
    console.log('SelectInput catches error', error, this.state);
    this.setState({ error });
  }

  reloadValues = (from: any) => {
    const cond = (this.props as any).fetchCondition ? (this.props as any).fetchCondition() : true;

    if (cond) {
      this.setState({ loading: true });
      return fetch(from || (this.props as any).valuesFrom, {
    method: 'GET',
    credentials: 'include',
    headers: {
        Accept: 'application/json',
    },
})
    .then((r) => r.json())
    .then((values) => values.map((this.props as any).transformer || ((a: any) => a)))
    .then((values) => {
    return this.setState({
        values,
        value: values.find((item: any) => item.value === (this.state.value ? this.state.value.value : this.state.value)) || null,
        loading: false,
    });
});
    }
  };

  onChange = (e: any) => {
    if (e) {
      this.setState({ value: e });
      (this.props as any).onChange(e.value);
    } else {
      this.setState({ value: null });
      (this.props as any).onChange(null);
    }
  };

  onChangeClassic = (e: any) => {
    this.setState({ value: e.target.value });
    (this.props as any).onChange(e.target.value);
  };

  render() {
    if (this.state.error) {
            return (<div className="mb-3 row">
                    <label htmlFor={`input-${(this.props as any).label}`} className="col-xs-12 col-sm-2 col-form-label">
                        <Help text={(this.props as any).help} label={(this.props as any).label}/>
          </label>
                    <div className="col-sm-10">
                        <div style={{ width: '100%' }}>
                            <span>{(this.state.error as any).message ? (this.state.error as any).message : this.state.error}</span>
            </div>
          </div>
        </div>);
    }
    if ((this.props as any).classic && !(this.props as any).disabled) {
            return (<div className="mb-3 row">
                    <label htmlFor={`input-${(this.props as any).label}`} className="col-xs-12 col-sm-2 col-form-label">
                        <Help text={(this.props as any).help} label={(this.props as any).label}/>
          </label>
                    <div className="col-sm-10">
                        <div style={{ width: '100%' }}>
                            <select className="form-control classic-select" value={this.state.value} onChange={this.onChangeClassic}>
                                {this.state.values.map((value: any, idx: any) => (<option key={idx} value={value.value}>
                    {value.label}
                  </option>))}
                classNamePrefix="reactSelect"
              </select>
            </div>
          </div>
        </div>);
    }
        return (<div className="mb-3 row">
                <label htmlFor={`input-${(this.props as any).label}`} className="col-xs-12 col-sm-2 col-form-label">
                    <Help text={(this.props as any).help} label={(this.props as any).label}/>
        </label>
                <div className="col-sm-10">
                    <div style={{ width: '100%' }} className="input-select">
                        <Select style={{ width: (this.props as any).more ? '100%' : '100%' }} name={`${(this.props as any).label}-search`} isLoading={this.state.loading} value={this.state.value} isDisabled={(this.props as any).disabled} placeholder={(this.props as any).placeholder} options={this.state.values} isClearable={(this.props as any).isClearable} onChange={this.onChange} classNamePrefix="reactSelect" className="reactSelect" menuPortalTarget={document.body} styles={{ menuPortal: (base) => ({ ...base, zIndex: 9999 }) }}/>
          </div>
        </div>
      </div>);
  }
}
