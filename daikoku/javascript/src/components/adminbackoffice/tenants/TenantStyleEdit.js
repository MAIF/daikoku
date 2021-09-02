import React, { useState, useEffect, useContext } from 'react';
import { connect } from 'react-redux';
import _ from 'lodash';
import { toastr } from 'react-redux-toastr';
import { SketchPicker } from 'react-color';

import * as Services from '../../../services';
import { UserBackOffice } from '../../backoffice';
import { Can, daikoku, manage, Option } from '../../utils';

import styleVariables from '!!raw-loader!../../../style/variables.scss';
import { I18nContext } from '../../../core';

const regexp = /var\((--.*),\s?(.*)\).*\/\/(.*)/g;

export function TenantStyleEditComponent(props) {
  const { translateMethod, Translation } = useContext(I18nContext);

  const [state, setState] = useState({
    tenant: null,
    style: [...styleVariables.matchAll(regexp)].map((item) => ({
      value: item[1],
      defaultColor: item[2],
      group: item[3],
    })),
    preview: false,
  });

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
      Services.oneTenant(props.match.params.tenantId).then((tenant) => {
        const style = state.style.map(({ value, defaultColor, group }) => {
          const color = Option(tenant.style.colorTheme.match(`${value}:\\s*([#r].*);`)).fold(
            () => defaultColor,
            (value) => value[1]
          );
          return { value, color: color, group };
        });
        setState({ ...state, tenant: { ...tenant }, style, initialStyle: style });
      });
    }
  }, []);

  const updateStyleProp = (item, color) => {
    const style = [...state.style.filter((s) => s.value !== item.value), { ...item, color }];
    setState({ ...state, style });
  };

  const getStyleFromState = () =>
    state.style.reduce((acc, curr) => {
      return `${acc}${curr.value}:${curr.color};\n`;
    }, ':root {\n') + '}';

  const goBack = () => {
    props.history.goBack();
  };

  const reset = () => {
    setState({ ...state, style: state.initialStyle });
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

  return (
    <UserBackOffice tab="Tenants" isLoading={!state.tenant}>
      {state.tenant && (
        <Can I={manage} a={daikoku} dispatchError>
          <div className="d-flex flex-row justify-content-between mb-1">
            <div>
              <button
                className="btn btn-access-negative"
                onClick={() => setState({ ...state, preview: !state.preview })}>
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
                {_.chain(state.style)
                  .groupBy('group')
                  .map((value, key) => ({ group: key, colors: value }))
                  .sortBy('group')
                  .value()
                  .map((item, idx) => {
                    const { group, colors } = item;
                    return (
                      <div key={idx}>
                        <h3>{group}</h3>
                        <div>
                          {_.sortBy(colors, ['value']).map((item, idx) => {
                            const property = state.style.find((c) => c.value === item.value);
                            return (
                              <div key={idx}>
                                <label htmlFor={item.value}>
                                  {item.value.replace(/-/gi, ' ').trim()}
                                </label>
                                <ColorPicker
                                  presetColors={state.style.map((c) => c.color)}
                                  initialColor={property.color}
                                  handleColorChange={(color) => updateStyleProp(item, color)}
                                />
                              </div>
                            );
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
      )}
    </UserBackOffice>
  );
}

const mapStateToProps = (state) => ({
  ...state.context,
});

export const TenantStyleEdit = connect(mapStateToProps)(TenantStyleEditComponent);

class Preview extends React.Component {
  componentDidMount() {
    this._updateIframe();
  }

  componentDidUpdate() {
    this._updateIframe();
  }

  _updateIframe() {
    const iframe = this.iframe;
    const document = iframe.contentDocument;
    const head = document.getElementsByTagName('head')[0];

    window.parent.document.querySelectorAll('link[rel=stylesheet]').forEach((link) => {
      var newLink = document.createElement('link');
      newLink.rel = link.rel;
      newLink.href = link.href;
      head && head.appendChild(newLink);
    });

    window.parent.document.querySelectorAll('style').forEach((style) => {
      var newLink = document.createElement('style');
      newLink.innerHTML = style.innerHTML;
      head && head.appendChild(newLink);
    });

    const styleVariables = this.props.variables
      .map((variable) => `${variable.value}:${variable.color};\n`)
      .join('');
    const root = `:root {${styleVariables}}`;

    const rootVariables = document.createElement('style');
    rootVariables.innerHTML = root;
    head && head.appendChild(rootVariables);
  }

  render() {
    return (
      <iframe
        ref={(ref) => (this.iframe = ref)}
        style={{
          height: '100vh',
          border: 'none',
          boxShadow: '0 14px 28px rgba(0, 0, 0, 0.25), 0 10px 10px rgba(0, 0, 0, 0.22)',
          borderRadius: '4px',
        }}
        src="/"
        className={this.props.className}
      />
    );
  }
}

const ColorPicker = ({ initialColor, handleColorChange, presetColors }) => {
  const sketchColorToReadableColor = (c) => {
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
      if (pickerValue.rgb.a === 1) {
        setColor(pickerValue.hex);
      } else {
        setColor(pickerValue.rgb);
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
            presetColors={_.uniq(presetColors).sort()}
            color={color}
            onChange={(value) => setPickerValue(value)}
          />
        </div>
      ) : null}
    </div>
  );
};
