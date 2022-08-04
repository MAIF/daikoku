import React, { useState, useEffect, useContext } from 'react';
import { connect } from 'react-redux';
import uniq from 'lodash/uniq';
import sortBy from 'lodash/sortBy';
import groupBy from 'lodash/groupBy';
import { toastr } from 'react-redux-toastr';
import { SketchPicker } from 'react-color';
import { useParams } from 'react-router-dom';

import * as Services from '../../../services';
import { Can, tenant as TENANT, manage, Option } from '../../utils';

import styleVariables from '!!raw-loader!../../../style/variables.scss';
import { I18nContext } from '../../../core';
import { useDaikokuBackOffice, useTenantBackOffice } from '../../../contexts';

const regexp = /var\((--.*),\s?(.*)\).*\/\/(.*)/g;

export function TenantStyleEditComponent(props: any) {
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
        navigate(`/settings/tenants/${state.tenant._id}`);
  };

  const reset = () => {
    setState({ ...state, style: (state as any).initialStyle });
  };

  const save = () => {
    Services.saveTenant({
            ...state.tenant,
            style: { ...state.tenant.style, colorTheme: getStyleFromState() },
    })
      .then(() => {
                document.location.href = `/settings/tenants/${state.tenant._id}`;
      })
      .then(() => toastr.success(translateMethod('Tenant updated successfully')));
  };

  if (!state.tenant) {
    return null;
  }

  return (
        <Can I={manage} a={TENANT} dispatchError>
            <div className="d-flex flex-row justify-content-between mb-1">
                <div>
                    <button
            className="btn btn-access-negative"
            onClick={() => setState({ ...state, preview: !state.preview })}
          >
                        <Translation i18nkey="Preview">Preview</Translation>
          </button>
        </div>
                <div>
                    <button className="btn btn-access-negative" onClick={() => goBack()}>
                        <Translation i18nkey="Cancel">Cancel</Translation>
          </button>
                    <button className="btn btn-access-negative mx-2" onClick={() => reset()}>
                        <Translation i18nkey="Reset">Reset</Translation>
          </button>
                    <button className="btn btn-outline-success" onClick={() => save()}>
                        <Translation i18nkey="Save">Save</Translation>
          </button>
        </div>
      </div>
            <div className="flex-row d-flex ">
        {!state.preview && (
                    <div className="flex-grow-0">
            {sortBy(Object.entries(groupBy(state.style, 'group')).map(([group, colors]) => ({ group, colors })), 'group')
              .map((item, idx) => {
                const { group, colors } = item;
                return (
                                    <div key={idx}>
                                        <h3>{group}</h3>
                                        <div>
                      {sortBy(colors, ['value']).map((item, idx) => {
                        const property = state.style.find((c) => c.value === item.value);
                                                return (<div key={idx}>
                                                        <label htmlFor={item.value}>
                              {item.value.replace(/-/gi, ' ').trim()}
                            </label>
                                                        <ColorPicker presetColors={state.style.map((c) => (c as any).color)} initialColor={(property as any).color} handleColorChange={(color: any) => updateStyleProp(item, color)}/>
                          </div>);
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
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
        <div>
            <div style={styles.swatch} onClick={() => setDisplayColorPicker(true)}>
                <div style={styles.color} />
      </div>
      {displayColorPicker ? (
                <div style={styles.popover}>
                    <div style={styles.cover} onClick={() => setDisplayColorPicker(false)} />
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
