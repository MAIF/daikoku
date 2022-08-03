import React, { useState, useEffect, useContext } from 'react';
import { connect } from 'react-redux';
import uniq from 'lodash/uniq';
import sortBy from 'lodash/sortBy';
import groupBy from 'lodash/groupBy';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { toastr } from 'react-redux-toastr';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { SketchPicker } from 'react-color';
import { useParams } from 'react-router-dom';

import * as Services from '../../../services';
import { Can, tenant as TENANT, manage, Option } from '../../utils';

// @ts-expect-error TS(2307): Cannot find module '!!raw-loader!../../../style/va... Remove this comment to see the full error message
import styleVariables from '!!raw-loader!../../../style/variables.scss';
import { I18nContext } from '../../../core';
import { useDaikokuBackOffice, useTenantBackOffice } from '../../../contexts';

const regexp = /var\((--.*),\s?(.*)\).*\/\/(.*)/g;

export function TenantStyleEditComponent(props: any) {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, Translation } = useContext(I18nContext);
  const params = useParams();

  const [state, setState] = useState({
    tenant: null,
    style: [...styleVariables.matchAll(regexp)].map((item) => ({
      value: item[1],
      defaultColor: item[2],
      group: item[3],
    })),
    preview: false,
  });

  useDaikokuBackOffice()

  useEffect(() => {
    if (props.location && props.location.state && props.location.state.newTenant) {
      setState({
        ...state,
        tenant: {
          ...props.location.state.newTenant,
        },
        // @ts-expect-error TS(2345): Argument of type '{ tenant: any; create: boolean; ... Remove this comment to see the full error message
        create: true,
      });
    } else {
      Services.oneTenant(params.tenantId)
        .then((tenant) => {
          const style = state.style.map(({ value, defaultColor, group }) => {
            const color = Option(tenant.style.colorTheme.match(`${value}:\\s*([#r].*);`)).fold(
              () => defaultColor,
              (value: any) => value[1]
            );
            return { value, color: color, group };
          });
          // @ts-expect-error TS(2322): Type '{ value: any; color: any; group: any; }[]' i... Remove this comment to see the full error message
          setState({ ...state, tenant: { ...tenant }, style, initialStyle: style });
        });
    }
  }, []);

  const updateStyleProp = (item: any, color: any) => {
    const style = [...state.style.filter((s) => s.value !== item.value), { ...item, color }];
    setState({ ...state, style });
  };

  const getStyleFromState = () =>
    state.style.reduce((acc, curr) => {
      return `${acc}${curr.value}:${(curr as any).color};\n`;
    }, ':root {\n') + '}';

  const goBack = () => {
    // @ts-expect-error TS(2552): Cannot find name 'navigate'. Did you mean 'navigat... Remove this comment to see the full error message
    navigate(`/settings/tenants/${state.tenant._id}`);
  };

  const reset = () => {
    setState({ ...state, style: (state as any).initialStyle });
  };

  const save = () => {
    Services.saveTenant({
      // @ts-expect-error TS(2698): Spread types may only be created from object types... Remove this comment to see the full error message
      ...state.tenant,
      // @ts-expect-error TS(2531): Object is possibly 'null'.
      style: { ...state.tenant.style, colorTheme: getStyleFromState() },
    })
      .then(() => {
        // @ts-expect-error TS(2531): Object is possibly 'null'.
        document.location.href = `/settings/tenants/${state.tenant._id}`;
      })
      .then(() => toastr.success(translateMethod('Tenant updated successfully')));
  };

  if (!state.tenant) {
    return null;
  }

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Can I={manage} a={TENANT} dispatchError>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="d-flex flex-row justify-content-between mb-1">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <button
            className="btn btn-access-negative"
            onClick={() => setState({ ...state, preview: !state.preview })}
          >
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Translation i18nkey="Preview">Preview</Translation>
          </button>
        </div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <button className="btn btn-access-negative" onClick={() => goBack()}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Translation i18nkey="Cancel">Cancel</Translation>
          </button>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <button className="btn btn-access-negative mx-2" onClick={() => reset()}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Translation i18nkey="Reset">Reset</Translation>
          </button>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <button className="btn btn-outline-success" onClick={() => save()}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Translation i18nkey="Save">Save</Translation>
          </button>
        </div>
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="flex-row d-flex ">
        {!state.preview && (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <div className="flex-grow-0">
            {sortBy(Object.entries(groupBy(state.style, 'group')).map(([group, colors]) => ({ group, colors })), 'group')
              .map((item, idx) => {
                const { group, colors } = item;
                return (
                  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  <div key={idx}>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <h3>{group}</h3>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <div>
                      {sortBy(colors, ['value']).map((item, idx) => {
                        const property = state.style.find((c) => c.value === item.value);
                        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                        return (<div key={idx}>
                            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                            <label htmlFor={item.value}>
                              {item.value.replace(/-/gi, ' ').trim()}
                            </label>
                            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                            <ColorPicker presetColors={state.style.map((c) => (c as any).color)} initialColor={(property as any).color} handleColorChange={(color: any) => updateStyleProp(item, color)}/>
                          </div>);
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Preview className="flex-grow-1" variables={state.style} />
      </div>
    </Can>
  );
}

const mapStateToProps = (state: any) => ({
  ...state.context
});

export const TenantStyleEdit = connect(mapStateToProps)(TenantStyleEditComponent);

class Preview extends React.Component {
  iframe: any;
  componentDidMount() {
    this._updateIframe();
  }

  componentDidUpdate() {
    this._updateIframe();
  }

  _updateIframe() {
    const iframe = this.iframe;
    const document = iframe.contentDocument;
    const head = Option(document.getElementsByTagName('head'))
      .map((h: any) => h[0])
      .getOrNull();

    window.parent.document.querySelectorAll('link[rel=stylesheet]').forEach((link) => {
      var newLink = document.createElement('link');
      newLink.rel = (link as any).rel;
      newLink.href = (link as any).href;
      head && head.appendChild(newLink);
    });

    window.parent.document.querySelectorAll('style').forEach((style) => {
      var newLink = document.createElement('style');
      newLink.innerHTML = style.innerHTML;
      head && head.appendChild(newLink);
    });

    const styleVariables = (this.props as any).variables
    .map((variable: any) => `${variable.value}:${variable.color};\n`)
    .join('');
    const root = `:root {${styleVariables}}`;

    const rootVariables = document.createElement('style');
    rootVariables.innerHTML = root;
    head && head.appendChild(rootVariables);
  }

  render() {
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    return (<iframe ref={(ref) => (this.iframe = ref)} style={{
        height: '100vh',
        border: 'none',
        boxShadow: '0 14px 28px rgba(0, 0, 0, 0.25), 0 10px 10px rgba(0, 0, 0, 0.22)',
        borderRadius: '4px',
    }} src="/" className={(this.props as any).className}/>);
  }
}

const ColorPicker = ({
  initialColor,
  handleColorChange,
  presetColors
}: any) => {
  const sketchColorToReadableColor = (c: any) => {
    if (c.r) {
      return `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})`;
    } else {
      return c;
    }
  };

  const [displayColorPicker, setDisplayColorPicker] = useState(false);
  const [color, setColor] = useState(initialColor);
  const [pickerValue, setPickerValue] = useState(null);

  const styles = {
    color: {
      width: '36px',
      height: '14px',
      borderRadius: '2px',
      background: `${color}`,
    },
    swatch: {
      padding: '5px',
      background: '#fff',
      borderRadius: '1px',
      boxShadow: '0 0 0 1px rgba(0,0,0,.1)',
      display: 'inline-block',
      cursor: 'pointer',
    },
    popover: {
      position: 'absolute',
      zIndex: '2',
    },
    cover: {
      position: 'fixed',
      top: '0px',
      right: '0px',
      bottom: '0px',
      left: '0px',
    },
  };

  useEffect(() => {
    if (pickerValue) {
      if ((pickerValue as any).rgb.a === 1) {
        setColor((pickerValue as any).hex);
      } else {
        setColor((pickerValue as any).rgb);
      }
    }
  }, [pickerValue]);

  useEffect(() => {
    handleColorChange(sketchColorToReadableColor(color));
  }, [color]);

  useEffect(() => {
    setColor(initialColor);
  }, [initialColor]);

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div style={styles.swatch} onClick={() => setDisplayColorPicker(true)}>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div style={styles.color} />
      </div>
      {displayColorPicker ? (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <div style={styles.popover}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div style={styles.cover} onClick={() => setDisplayColorPicker(false)} />
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <SketchPicker
            presetColors={uniq(presetColors).sort()}
            color={color}
            onChange={(value: any) => setPickerValue(value)}
          />
        </div>
      ) : null}
    </div>
  );
};
