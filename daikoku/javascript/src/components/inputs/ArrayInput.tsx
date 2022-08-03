import React, { useState, useEffect, useContext } from 'react';
import Select from 'react-select';
import CreatableSelect from 'react-select/creatable';
import { I18nContext } from '../../core';
// @ts-expect-error TS(6142): Module './Help' was resolved to '/Users/qaubert/So... Remove this comment to see the full error message
import { Help } from './Help';

const valueToSelectOption = (value: any) => {
  if (value === null) {
    return null;
  }
  return {
    label: value.label || value,
    value: value.value || value,
  };
};

export function ArrayInput(props: any) {
  const [state, setState] = useState({
    loading: false,
    values: [],
    value: (props.value || []).map(valueToSelectOption),
    inputValue: '',
  });

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  useEffect(() => {
    if (props.value) {
      if (props.valuesFrom) {
        // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
        reloadValues();
      } else setState({ ...state, value: (props.value || []).map(valueToSelectOption) });
    }
  }, [props.valuesFrom]);

  const reloadValues = (from: any) => {
    setState({ ...state, loading: true });
    return fetch(from || props.valuesFrom, {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
    })
      .then((r) => r.json())
      .then((values) => values.map(props.transformer || ((a: any) => a)))
      .then((values) =>
        setState({
          ...state,
          values,
          value: !props.creatable
            ? values.filter((v: any) => props.value.includes(v.value))
            : (props.value || []).map(valueToSelectOption),
          loading: false,
        })
      );
  };

  const changeValue = (e: any) => {
    if (e) {
      if (e.some((item: any) => item.__isNew__)) {
        const newVals = e.filter((item: any) => item.__isNew__);
        // @ts-expect-error TS(2322): Type 'any[]' is not assignable to type 'never[]'.
        setState({ ...state, value: e, values: [...state.values, ...newVals] });
      } else {
        setState({ ...state, value: e });
        const finaItem = (item: any) => props.transformSet ? props.transformSet(item.value) : item.value;
        props.onChange(e.map(finaItem));
      }
    } else {
      setState({ ...state, value: null });
      props.onChange(null);
    }
  };

  const handleInputChange = (inputValue: any) => {
    setState({ ...state, inputValue });
  };

  const handleKeyDown = (event: any) => {
    const { inputValue, value } = state;
    if (!inputValue) return;

    const newValue = [...value, { label: inputValue, value: inputValue }];
    const finaItem = (item: any) => props.transformSet ? props.transformSet(item.value) : item.value;
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
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="mb-3 row" style={{ marginBottom: 15 }}>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <label htmlFor={`input-${props.label}`} className="col-xs-12 col-sm-2 col-form-label">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Help text={props.help} label={props.label} />
        </label>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="col-sm-10">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div style={{ width: '100%' }}>
            {!props.valuesFrom && !props.creatable && (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
