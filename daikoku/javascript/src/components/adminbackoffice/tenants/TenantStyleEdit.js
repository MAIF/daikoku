import React, { Component, useState, useEffect } from 'react';
import { connect } from 'react-redux';
import _ from 'lodash';
import { toastr } from 'react-redux-toastr'
import { SketchPicker } from 'react-color';

import * as Services from '../../../services';
import { UserBackOffice } from '../../backoffice';
import { Can, daikoku, manage, Option } from '../../utils';
import { t } from '../../../locales';

import styleVariables from '!!raw-loader!../../../style/variables.scss';

const regexp = /var\((--.*),\s?(.*)\).*\/\/(.*)/g;

export class TenantStyleEditComponent extends Component {
  state = {
    tenant: null,
    style: [...styleVariables.matchAll(regexp)].map(item => ({ value: item[1], defaultColor: item[2], group: item[3] })),
    inputView: true,
    preview: false,
    styles: [
      'http://daikoku.oto.tools:3000/daikoku.css'//todo: add real style from server
    ]
  };

  componentDidMount() {
    if (this.props.location && this.props.location.state && this.props.location.state.newTenant) {
      this.setState({
        tenant: {
          ...this.props.location.state.newTenant
        },
        create: true,
      });
    } else {
      Services.oneTenant(this.props.match.params.tenantId).then(tenant => {
        const style = this.state.style
          .map(({ value, defaultColor, group }) => {
            const color = Option(tenant.style.colorTheme.match(`${value}:\\s*(#.*);`)).fold(() => defaultColor, value => value[1])
            return ({ value, color: color, group })
          })
        this.setState({ tenant: { ...tenant }, style, initialStyle: style });
      });
    }
  }

  updateStyleProp(item, color) {
    const style = [...this.state.style.filter(s => s.value !== item.value), { ...item, color }];
    this.setState({ style })
  }

  getStyleFromState() {
    return this.state.style.reduce((acc, curr) => {
      return `${acc}${curr.value}:${curr.color};\n`
    }, ":root {\n") + "}"
  }

  goBack() {
    this.props.history.goBack();
  }

  reset() {
    this.setState({ style: this.state.initialStyle });
  }

  save() {
    Services.saveTenant({ ...this.state.tenant, style: { ...this.state.tenant.style, colorTheme: this.getStyleFromState() } })
      .then(() => {
        document.location.href = `/settings/tenants/${this.state.tenant._id}`
      })
      .then(() =>
        toastr.success(t('Tenant updated successfully', this.props.currentLanguage))
      )
  }

  render() {
    return (
      <UserBackOffice tab="Tenants" isLoading={!this.state.tenant}>
        {this.state.tenant && (
          <Can I={manage} a={daikoku} dispatchError>
            <div className="d-flex flex-row justify-content-between">
              <div>
                <button className="btn btn-access-negative" onClick={() => this.setState({ inputView: !this.state.inputView })}>switch</button>
                <button className="btn btn-access-negative" onClick={() => this.setState({ preview: !this.state.preview })}>Preview</button>
              </div>
              <div>
                <button className="btn btn-access-negative" onClick={() => this.goBack()}>Cancel</button>
                <button className="btn btn-access-negative" onClick={() => this.reset()}>Reset</button>
                <button className="btn btn-access-negative" onClick={() => this.save()}>Save</button>
              </div>
            </div>
            <div className="flex-row d-flex ">
              {!this.state.inputView && !this.state.preview && (
                <div className="flex-grow-0">
                  <textarea className="form-control" value={this.getStyleFromState()} />
                </div>
              )}
              {this.state.inputView && !this.state.preview && (
                <div className="flex-grow-0">
                  {Object.entries(_.groupBy(this.state.style, 'group')).sort((a, b) => b[1] - a[1]).map((item, idx) => {
                    const [group, colors] = item;
                    return (
                      <div key={idx}>
                        <h3>{group}</h3>
                        <div>
                          {colors.sort((a, b) => b.value - a.value).map((item, idx) => {
                            const property = this.state.style.find(c => c.value === item.value);
                            return (
                              <div key={idx}>
                                <label htmlFor={item.value}>{item.value.replace(/-/gi, ' ').trim()}</label>
                                <SketchExample initialColor={property.color} handleColorChange={color => this.updateStyleProp(item, color)}/>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              <Preview className="flex-grow-1" variables={this.state.style} stylesheets={this.state.styles} />
            </div>
          </Can>
        )}
      </UserBackOffice>
    )
  }
}


const mapStateToProps = state => ({
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
    const iframe = this.refs.iframe;
    const document = iframe.contentDocument;
    const head = document.getElementsByTagName('head')[0];
    // document.body.innerHTML = this.props.content;



    window.parent.document.querySelectorAll("link[rel=stylesheet]").forEach(link => {
      var newLink = document.createElement("link");
      newLink.rel = link.rel;
      newLink.href = link.href;
      head.appendChild(newLink);
    });

    window.parent.document.querySelectorAll("style").forEach(style => {
      var newLink = document.createElement("style");
      newLink.innerHTML = style.innerHTML;
      head.appendChild(newLink);
    });

    const styleVariables = this.props.variables.map(variable => `${variable.value}:${variable.color};\n`).join("")
    const root = `:root {${styleVariables}}`

    const rootVariables = document.createElement('style');
    rootVariables.innerHTML = root;
    head.appendChild(rootVariables);
  }

  render() {
    return <iframe ref="iframe" style={{ height: "100vh" }} src="/" className={this.props.className} />
  }
}

const SketchExample = ({initialColor, handleColorChange}) => {

  const [displayColorPicker, setDisplayColorPicker] = useState(false);
  const [color, setColor] = useState(initialColor)
  const [pickerValue, setPickerValue] = useState(null)

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
        setColor(pickerValue.hex)
      } else {
        setColor(pickerValue.rgb)
      }
    }
  }, [pickerValue])

  useEffect(() => {
    handleColorChange(color)
  }, [color])

  useEffect(() => {
    setColor(initialColor)
  }, [initialColor])

  return (
    <div>
      <div style={styles.swatch} onClick={() => setDisplayColorPicker(true)}>
        <div style={styles.color} />
      </div>
      {displayColorPicker ? <div style={styles.popover}>
        <div style={styles.cover} onClick={() => setDisplayColorPicker(false)} />
        <SketchPicker color={color} onChange={value => setPickerValue(value)} />
      </div> : null}

    </div>
  )
}