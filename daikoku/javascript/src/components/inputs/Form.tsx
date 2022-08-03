import React, { Component } from 'react';
import { connect } from 'react-redux';
import isFunction from 'lodash/isFunction';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'get-... Remove this comment to see the full error message
import get from 'get-value';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'set-... Remove this comment to see the full error message
import set from 'set-value';

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
// @ts-expect-error TS(6142): Module './CodeInput.js' was resolved to '/Users/qa... Remove this comment to see the full error message
const LazyCodeInput = React.lazy(() => import('./CodeInput.js'));
// @ts-expect-error TS(2322): Type 'Promise<typeof import("/Users/qaubert/Source... Remove this comment to see the full error message
const LazySingleMarkdownInput = React.lazy(() => import('./SingleMarkdownInput.js'));
// @ts-expect-error TS(6142): Module './ArrayForm' was resolved to '/Users/qaube... Remove this comment to see the full error message
const LazyArrayForm = React.lazy(() => import('./ArrayForm'));
// @ts-expect-error TS(6142): Module './Collapse' was resolved to '/Users/qauber... Remove this comment to see the full error message
import { Collapse } from './Collapse';

type FormComponentProps = {
    value?: any;
    onChange?: (...args: any[]) => any;
    schema?: any;
    flow?: any[];
};


class FormComponent extends Component<FormComponentProps> {
  collapsed: any;
  collapsedLabel: any;
  collapsedState: any;

  changeValue = (name: any, value: any) => {
    // if (name === '') {
    //   this.props.onChange(value);
    //   return;
    // }
    const newValue = { ...this.props.value };
    set(newValue, name, value);
    // @ts-expect-error TS(2722): Cannot invoke an object which is possibly 'undefin... Remove this comment to see the full error message
    this.props.onChange(newValue);
  };

  getValue = (name: any, defaultValue: any) => {
    return get(this.props.value, name) || defaultValue;
  };

  generateStep(name: any, idx: any) {
    if (isFunction(name)) {
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
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <Collapse key={idx} label={collapsedLabel} collapsed={collapsedState} lineEnd={true}>
            {collapsed}
          </Collapse>
        );
      } else {
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
      const realDisabled = isFunction(disabled) ? disabled(this.props.value) : disabled;
      if (visible && isFunction(visible) && !visible(this.props.value)) {
        component = null;
      } else if (type) {
        if (type === 'array') {
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          component = (<ArrayInput disabled={realDisabled} key={name} value={this.getValue(name, [])} {...props} onChange={(v: any) => this.changeValue(name, v)} currentLanguage={(this.props as any).currentLanguage}/>);
        } else if (type === 'object') {
          component = (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <ObjectInput
              disabled={disabled}
              key={name}
              value={this.getValue(name, {})}
              {...props}
              onChange={(v: any) => this.changeValue(name, v)}
            />
          );
        } else if (type === 'bool') {
          component = (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <BooleanInput
              disabled={disabled}
              key={name}
              value={this.getValue(name, false)}
              {...props}
              onChange={(v: any) => this.changeValue(name, v)}
            />
          );
        } else if (type === 'select') {
          component = (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <SelectInput
              disabled={disabled}
              key={name}
              value={this.getValue(name, '')}
              {...props}
              onChange={(v: any) => this.changeValue(name, v)}
            />
          );
        } else if (type === 'string') {
          component = (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <TextInput
              disabled={disabled}
              key={name}
              value={this.getValue(name, '')}
              {...props}
              onChange={(v: any) => this.changeValue(name, v)}
            />
          );
        } else if (type === 'text') {
          component = (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <TextareaInput
              disabled={disabled}
              key={name}
              value={this.getValue(name, '')}
              {...props}
              onChange={(v: any) => this.changeValue(name, v)}
            />
          );
        } else if (type === 'code') {
          return (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <React.Suspense key={name} fallback={<div>loading...</div>}>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <LazyCodeInput
                disabled={disabled}
                key={name}
                value={this.getValue(name, '')}
                {...props}
                onChange={(v: any) => this.changeValue(name, v)}
              />
            </React.Suspense>
          );
        } else if (type === 'markdown') {
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          component = (<React.Suspense key={name} fallback={<div>loading...</div>}>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <LazySingleMarkdownInput currentLanguage={(this.props as any).currentLanguage} disabled={disabled} key={name} value={this.getValue(name, '')} {...props} onChange={(v: any) => this.changeValue(name, v)}/>
            </React.Suspense>);
        } else if (type === 'label') {
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          component = <LabelInput key={name} value={this.getValue(name, '')} {...props} />;
        } else if (type === 'number') {
          component = (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <NumberInput
              disabled={disabled}
              key={name}
              value={this.getValue(name, 0)}
              {...props}
              onChange={(v: any) => this.changeValue(name, v)}
            />
          );
        } else if (type === 'arrayForm') {
          component = (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <React.Suspense key={name} fallback={<Spinner />}>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <LazyArrayForm
                disabled={disabled}
                key={name}
                value={this.getValue(name, '')}
                {...props}
                onChange={(v: any) => this.changeValue(name, v)}
              />
            </React.Suspense>
          );
        } else if (isFunction(type)) {
          component = React.createElement(type, {
            ...props,
            disabled,
            rawValue: this.props.value,
            key: name,
            value: this.getValue(name, {}),
            changeValue: this.changeValue,
            onChange: (v: any) => this.changeValue(name, v),
            // @ts-expect-error TS(2722): Cannot invoke an object which is possibly 'undefin... Remove this comment to see the full error message
            onRawChange: (v: any) => this.props.onChange(v),
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
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Collapse key="last" label={collapsedLabel} collapsed={collapsedState}>
          {collapsed}
        </Collapse>
      );
    } else {
      return null;
    }
  }

  render() {
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    return (<form style={{ ...(this.props as any).style }} className="col-12 section pt-2 pe-2">
        {/* @ts-expect-error TS(2532): Object is possibly 'undefined'. */}
        {this.props.flow.map((step, idx) => this.generateStep(step, idx))}
        {this.generateLastStep()}
      </form>);
  }
}

const mapStateToProps = (state: any) => ({
  ...state.context
});

export default connect(mapStateToProps)(FormComponent);
