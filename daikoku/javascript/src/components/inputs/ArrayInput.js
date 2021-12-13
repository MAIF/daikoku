import React, { useState, useEffect, useContext } from 'react';
import Select from 'react-select';
import CreatableSelect from 'react-select/creatable';
import { I18nContext } from '../../core';
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

export function ArrayInput(props) {
  const [state, setState] = useState({
    loading: false,
    values: [],
    value: (props.value || []).map(valueToSelectOption),
    inputValue: '',
  });

  const { translateMethod } = useContext(I18nContext);

  useEffect(() => {
    if (props.value) {
      if (props.valuesFrom) {
        reloadValues();
      } else setState({ ...state, value: (props.value || []).map(valueToSelectOption) });
    }
  }, [props.valuesFrom]);

  const reloadValues = (from) => {
    setState({ ...state, loading: true });
    return fetch(from || props.valuesFrom, {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
    })
      .then((r) => r.json())
      .then((values) => values.map(props.transformer || ((a) => a)))
      .then((values) =>
        setState({
          ...state,
          values,
          value: !props.creatable
            ? values.filter((v) => props.value.includes(v.value))
            : (props.value || []).map(valueToSelectOption),
          loading: false,
        })
      );
  };

  const changeValue = (e) => {
    if (e) {
      if (e.some((item) => item.__isNew__)) {
        const newVals = e.filter((item) => item.__isNew__);
        setState({ ...state, value: e, values: [...state.values, ...newVals] });
      } else {
        setState({ ...state, value: e });
        const finaItem = (item) =>
          props.transformSet ? props.transformSet(item.value) : item.value;
        props.onChange(e.map(finaItem));
      }
    } else {
      setState({ ...state, value: null });
      props.onChange(null);
    }
  };

  const handleInputChange = (inputValue) => {
    setState({ ...state, inputValue });
  };

  const handleKeyDown = (event) => {
    const { inputValue, value } = state;
    if (!inputValue) return;

    const newValue = [...value, { label: inputValue, value: inputValue }];
    const finaItem = (item) => (props.transformSet ? props.transformSet(item.value) : item.value);
    switch (event.key) {
      case 'Enter':
      case 'Tab':
        setState({
          ...state,
          inputValue: '',
          value: newValue,
        });
        props.onChange(newValue.map(finaItem));
        event.preventDefault();
    }
  };

  const placeholder = translateMethod('array.input.placeholder');
  return (
    <div>
      <div className="form-group row" style={{ marginBottom: 15 }}>
        <label htmlFor={`input-${props.label}`} className="col-xs-12 col-sm-2 col-form-label">
          <Help text={props.help} label={props.label} />
        </label>
        <div className="col-sm-10">
          <div style={{ width: '100%' }}>
            {!props.valuesFrom && !props.creatable && (
              <CreatableSelect
                isDisabled={props.disabled}
                components={{ DropdownIndicator: null }}
                inputValue={state.inputValue}
                isClearable
                isMulti
                menuIsOpen={false}
                onChange={changeValue}
                onInputChange={handleInputChange}
                onKeyDown={handleKeyDown}
                options={props.options}
                placeholder={placeholder}
                value={state.value}
                className="input-select reactSelect"
                classNamePrefix="reactSelect"
              />
            )}
            {!!props.valuesFrom && props.creatable && (
              <CreatableSelect
                isDisabled={props.disabled}
                components={{ DropdownIndicator: null }}
                inputValue={state.inputValue}
                isClearable
                isMulti
                onChange={changeValue}
                onInputChange={handleInputChange}
                onKeyDown={handleKeyDown}
                options={state.values}
                placeholder={placeholder}
                value={state.value}
              />
            )}
            {!!props.valuesFrom && !props.creatable && (
              <Select
                name={`${props.label}-selector`}
                className={props.selectClassName}
                value={state.value}
                isLoading={state.loading}
                isMulti
                isDisabled={props.disabled}
                placeholder={props.placeholder}
                options={state.values}
                onChange={changeValue}
                classNamePrefix="reactSelect"
                menuPortalTarget={document.body}
                styles={{ menuPortal: (base) => ({ ...base, zIndex: 9999 }) }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
