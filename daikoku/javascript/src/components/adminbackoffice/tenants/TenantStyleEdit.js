import React, { Component } from 'react';
import { connect } from 'react-redux';
import _ from 'lodash';

import * as Services from '../../../services';
import { UserBackOffice } from '../../backoffice';
import { Can, daikoku, manage } from '../../utils';



const variables = [
  { group: "status", value: "--error-color", label: "error color", defaultColor: "#fc0d1a" },
  { group: "status", value: "--success-color", label: "success color", defaultColor: "#3c9f2a" },
  { group: "link", value: "--link-color", label: "link color", defaultColor: "#2e404f" },
  { group: "link", value: "--link--hover-color", label: "link hover color", defaultColor: "#2e404f" },
  { group: "body", value: "--body-bg-color", label: "body background color", defaultColor: "#fcf9f5" },
  { group: "body", value: "--body-text-color", label: "body text color", defaultColor: "#212529" },
  { group: "navbar", value: "--navbar-bg-color", label: "navbar background color", defaultColor: "#fff" },
  { group: "navbar", value: "--navbar-brand-color", label: "navbar brand color", defaultColor: "#c62222" },
  { group: "navbar", value: "--navbar-text-color", label: "navbar text color", defaultColor: "#2e404f" },
  { group: "menu", value: "--menu-bg-color", label: "menu background color", defaultColor: "#ede9e2" },
  { group: "menu", value: "--menu-text-color", label: "menu text color", defaultColor: "#2e404f" },
  { group: "menu", value: "--menu-text-hover-color", label: "menu text hover color", defaultColor: "#2e404f" },
  { group: "menu", value: "--menu-text-hover-bg-color", label: "menu text hover background color", defaultColor: "#e1d9cc" },
  { group: "body", value: "--section-bg-color", label: "section background color", defaultColor: "#f6f3f1" },
  { group: "body", value: "--section-text-color", label: "section text color", defaultColor: "#2e404f" },
  { group: "body", value: "--section-bottom-color", label: "section bottom color", defaultColor: "#2e404f" },
  { group: "body", value: "--addContent-bg-color", label: "additonal content background color", defaultColor: "#ede9e2" },
  { group: "body", value: "--addContent-text-color", label: "additonal content text color", defaultColor: "#2e404f" },
  { group: "sidebar", value: "--sidebar-bg-color", label: "sidebar background color", defaultColor: "#ede9e2" },
  { group: "button", value: "--btn-bg-color", label: "button bacground color", defaultColor: "#fff" },
  { group: "button", value: "--btn-bg-hover-color", label: "button background hover color", defaultColor: "#fff" },
  { group: "button", value: "--btn-text-color", label: "button text color", defaultColor: "#2e404f" },
  { group: "button", value: "--btn-border-color", label: "button border color", defaultColor: "#2e404f" },
  { group: "badge", value: "--badge-tags-bg-color", label: "badge tags background color", defaultColor: "#ccc" },
  { group: "badge", value: "--badge-tags-text-color", label: "badge tags text color", defaultColor: "#2e404f" },
  { group: "pagination", value: "--pagination-text-color", label: "pagination text color", defaultColor: "#2e404f" },
  { group: "pagination", value: "--pagination-border-color", label: "pagination border color", defaultColor: "#2e404f" },
  { group: "table", value: "--table-bg-color", label: "table background color", defaultColor: "#ede9e2" },
  { group: "apicard", value: "--apicard-visibility-color", label: "apicard color", defaultColor: "#2e404f" },
  { group: "apicard", value: "--apicard-visibility-border-color", label: "apicard border color", defaultColor: "#2e404f" },
  { group: "modal", value: "--modal-selection-bg-color", label: "modal background color", defaultColor: "#ede9e2" },
]

const regex = value => `${value}:\\s*(#.*);`

export class TenantStyleEditComponent extends Component {
  state = {
    tenant: null,
    style: variables.map(item => ({value: item.value, color: item.defaultColor})),
    inputView: true
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
          .map(({ value, defaultColor }) => {
            const color = tenant.style.colorTheme.match(`${value}:\\s*(#.*);`)[1]
            return ({ value, color : color || defaultColor })
          })
        this.setState({ tenant: { ...tenant }, style });
      });
    }
  }

  updateStyleProp(value, color) {
    const style = [...this.state.style.filter(s => s.value !== value), {value, color}];
    this.setState({style})
  }

  getStyleFromState() {
    return this.state.style.reduce((acc, curr) => {
      return `${acc}${curr.value}:${curr.color};\n`
    }, ":root {\n") + "}"
  }

  render() {
    return (
      <UserBackOffice tab="Tenants" isLoading={!this.state.tenant}>
        {this.state.tenant && (
          <Can I={manage} a={daikoku} dispatchError>
            <button className="btn btn-access-negative" onClick={() => this.setState({inputView: !this.state.inputView})}>switch</button>
            <div className="row">
              {!this.state.inputView && (
                <div>
                  <textarea className="form-control" value={this.getStyleFromState()}/>
                </div>
              )}
              {this.state.inputView && (
                <div className="test--style col-6">
                  {Object.entries(_.groupBy(variables, 'group')).map((item, idx) => {
                    const [group, colors] = item;
                    return (
                      <div key={idx}>
                        <h3>{group}</h3>
                        <div>
                          {colors.map((item, idx) => {
                            const property = this.state.style.find(c => c.value === item.value);
                            return (
                              <div key={idx}>
                                <label htmlFor={item.value}>{item.label}</label>
                                <div className="input-group mb-3">
                                  <div className="input-group-prepend">
                                    <span className="input-group-text">#</span>
                                  </div>
                                  <input 
                                    type="text" 
                                    className="form-control" 
                                    value={property.color.slice(1)}
                                    onChange={e => this.updateStyleProp(item.value, '#' + e.target.value)}/>
                                  <input 
                                    type="color" 
                                    className="form-control" 
                                    id={item.value} 
                                    value={property.color} 
                                    onChange={e => this.updateStyleProp(item.value, e.target.value)} />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              <Preview style={this.state.style} />
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


class Preview extends Component {
  getColor(value) {
    return this.props.style.find(item => item.value === value).color
  }

  render() {
    return (
      <div className="col-6">
        <button className="btn" style={{
          color: this.getColor('--btn-bg-color'),
          backgroundColor: this.getColor('--btn-text-color'),
          borderColor: this.getColor('--btn-bg-color')
        }}>Test btn access</button>
        <button className="btn" style={{
          backgroundColor: this.getColor('--btn-bg-color'),
          color: this.getColor('--btn-text-color'),
          borderColor: this.getColor('--btn-border-color')
        }}>Test btn access negative</button>
        <a href="#" style={{
          color: this.getColor('--link-color'),
        }}>Test link</a>
      </div>
    )
  }
}