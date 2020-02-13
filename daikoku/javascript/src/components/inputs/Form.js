import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Spinner } from '../utils';

import {
  ArrayInput,
  ObjectInput,
  BooleanInput,
  SelectInput,
  TextInput,
  NumberInput,
  LabelInput,
  TextareaInput,
} from '.';

const LazyCodeInput = React.lazy(() => import('./CodeInput.js'));
const LazySingleMarkdownInput = React.lazy(() => import('./SingleMarkdownInput.js'));
const LazyArrayForm = React.lazy(() => import('./ArrayForm'));

import _ from 'lodash';
import { Collapse } from './Collapse';

import get from 'get-value';
import set from 'set-value';

export default class Form extends Component {
  static propTypes = {
    value: PropTypes.object,
    onChange: PropTypes.func,
    schema: PropTypes.object,
    flow: PropTypes.array,
  };

  changeValue = (name, value) => {
    // if (name === '') {
    //   this.props.onChange(value);
    //   return;
    // }
    const newValue = { ...this.props.value };
    set(newValue, name, value);
    this.props.onChange(newValue);
  };

  getValue = (name, defaultValue) => {
    return get(this.props.value, name) || defaultValue;
  };

  generateStep(name, idx) {
    if (_.isFunction(name)) {
      return React.createElement(name, {});
    } else if (React.isValidElement(name)) {
      return name;
    } else if (name.indexOf('>>>') === 0) {
      if (this.collapsed) {
        const collapsed = this.collapsed;
        const collapsedState = this.collapsedState;
        const collapsedLabel = this.collapsedLabel;
        this.collapsed = [];
        this.collapsedState = true;
        this.collapsedLabel = name.replace('>>>', '');
        return (
          <Collapse key={idx} label={collapsedLabel} collapsed={collapsedState}>
            {collapsed}
          </Collapse>
        );
      } else {
        this.collapsed = [];
        this.collapsedState = true;
        this.collapsedLabel = name.replace('>>>', '');
        return null;
      }
    } else if (name.indexOf('<<<') === 0) {
      if (this.collapsed) {
        const collapsed = this.collapsed;
        const collapsedState = this.collapsedState;
        const collapsedLabel = this.collapsedLabel;
        this.collapsed = [];
        this.collapsedState = false;
        this.collapsedLabel = name.replace('<<<', '');
        return (
          <Collapse key={idx} label={collapsedLabel} collapsed={collapsedState}>
            {collapsed}
          </Collapse>
        );
      } else {
        this.collapsed = [];
        this.collapsedState = false;
        this.collapsedLabel = name.replace('<<<', '');
        return null;
      }
    } else if (name === '---') {
      if (this.collapsed) {
        const collapsed = this.collapsed;
        const collapsedState = this.collapsedState;
        const collapsedLabel = this.collapsedLabel;
        delete this.collapsed;
        delete this.collapsedState;
        delete this.collapsedLabel;
        return (
          <Collapse key={idx} label={collapsedLabel} collapsed={collapsedState} lineEnd={true}>
            {collapsed}
          </Collapse>
        );
      } else {
        return <hr key={idx} />;
      }
    } else {
      // console.log('name', name)
      if (!this.props.schema[name]) {
        throw new Error(`Field ${name} is not defined in the schema ...`);
      }
      const { type, disabled, props = {} } = this.props.schema[name];
      // console.log('generate', name, 'of type', type, 'from', this.props.schema);
      let component = null;
      const visible = this.props.schema[name].visible;
      const realDisabled = _.isFunction(disabled) ? disabled(this.props.value) : disabled;
      if (visible && _.isFunction(visible) && !visible(this.props.value)) {
        component = null;
      } else if (type) {
        if (type === 'array') {
          component = (
            <ArrayInput
              disabled={realDisabled}
              key={name}
              value={this.getValue(name, [])}
              {...props}
              onChange={v => this.changeValue(name, v)}
            />
          );
        } else if (type === 'object') {
          component = (
            <ObjectInput
              disabled={disabled}
              key={name}
              value={this.getValue(name, {})}
              {...props}
              onChange={v => this.changeValue(name, v)}
            />
          );
        } else if (type === 'bool') {
          component = (
            <BooleanInput
              disabled={disabled}
              key={name}
              value={this.getValue(name, false)}
              {...props}
              onChange={v => this.changeValue(name, v)}
            />
          );
        } else if (type === 'select') {
          component = (
            <SelectInput
              disabled={disabled}
              key={name}
              value={this.getValue(name, '')}
              {...props}
              onChange={v => this.changeValue(name, v)}
            />
          );
        } else if (type === 'string') {
          component = (
            <TextInput
              disabled={disabled}
              key={name}
              value={this.getValue(name, '')}
              {...props}
              onChange={v => this.changeValue(name, v)}
            />
          );
        } else if (type === 'text') {
          component = (
            <TextareaInput
              disabled={disabled}
              key={name}
              value={this.getValue(name, '')}
              {...props}
              onChange={v => this.changeValue(name, v)}
            />
          );
        } else if (type === 'code') {
          return (
            <React.Suspense key={name} fallback={<div>loading...</div>}>
              <LazyCodeInput
                disabled={disabled}
                key={name}
                value={this.getValue(name, '')}
                {...props}
                onChange={v => this.changeValue(name, v)}
              />
            </React.Suspense>
          );
        } else if (type === 'markdown') {
          component = (
            <React.Suspense key={name} fallback={<div>loading...</div>}>
              <LazySingleMarkdownInput
                disabled={disabled}
                key={name}
                value={this.getValue(name, '')}
                {...props}
                onChange={v => this.changeValue(name, v)}
              />
            </React.Suspense>
          );
        } else if (type === 'label') {
          component = <LabelInput key={name} value={this.getValue(name, '')} {...props} />;
        } else if (type === 'number') {
          component = (
            <NumberInput
              disabled={disabled}
              key={name}
              value={this.getValue(name, 0)}
              {...props}
              onChange={v => this.changeValue(name, v)}
            />
          );
        } else if (type === 'arrayForm') {
          component = (
            <React.Suspense key={name} fallback={<Spinner />}>
              <LazyArrayForm
                disabled={disabled}
                key={name}
                value={this.getValue(name, '')}
                {...props}
                onChange={v => this.changeValue(name, v)}
              />
            </React.Suspense>
          );
        } else if (_.isFunction(type)) {
          component = React.createElement(type, {
            ...props,
            disabled,
            rawValue: this.props.value,
            key: name,
            value: this.getValue(name, {}),
            changeValue: this.changeValue,
            onChange: v => this.changeValue(name, v),
            onRawChange: v => this.props.onChange(v),
          });
        } else if (React.isValidElement(type)) {
          component = type;
        } else {
          console.error(`No field named '${name}' of type ${type}`);
        }
      }
      if (this.collapsed) {
        this.collapsed.push(component);
        return null;
      } else {
        return component;
      }
    }
  }

  generateLastStep() {
    if (this.collapsed) {
      const collapsed = this.collapsed;
      const collapsedState = this.collapsedState;
      const collapsedLabel = this.collapsedLabel;
      delete this.collapsed;
      delete this.collapsedState;
      delete this.collapsedLabel;
      return (
        <Collapse key="last" label={collapsedLabel} collapsed={collapsedState}>
          {collapsed}
        </Collapse>
      );
    } else {
      return null;
    }
  }

  render() {
    return (
      <form style={{ ...this.props.style}} className="col-12 section pt-2 pr-2">
        {this.props.flow.map((step, idx) => this.generateStep(step, idx))}
        {this.generateLastStep()}
      </form>
    );
  }
}
