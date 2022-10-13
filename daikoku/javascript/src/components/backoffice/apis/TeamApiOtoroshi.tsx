import React, { Component } from 'react';

type State = any;

export class TeamApiOtoroshi extends Component<{}, State> {
  addNewPlan: any;
  deletePlan: any;
  state = {
    selected: null,
  };

  componentDidMount() {
    // TODO: register callback
  }

  select = (selected: any) => {
    // TODO: fetch oto service
    this.setState({ selected });
  };

  onChange = () => {
    // TODO: save oto service
  };

  isSelected = (service: any) => {
    return this.state.selected && service.service === (this.state.selected as any).service;
  };

  addNewService = () => { };

  deleteService = () => {
    (window.confirm('Are you sure you want to delete this service ?') as any).then((ok: any) => {
      if (ok) {
        // TODO: delete in api
        // TODO: delete in oto
      }
    });
  };

  render() {
    if ((this.props as any).value === null) return null;
    return (<div style={{ display: 'flex', width: '100%' }}>
      <div style={{
        width: '30%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: 5,
        backgroundColor: '#f6f7f7',
      }}>
        <button onClick={this.addNewPlan} type="button" className="btn btn-sm btn-outline-secondary" style={{ marginBottom: 10, width: '100%' }}>
          <i className="fas fa-plus" /> add a new service
        </button>
        <table className="table table-striped table-bordered table-hover table-sm">
          <thead className="thead-light">
            <tr>
              <th scope="col">Service name</th>
            </tr>
          </thead>
          <tbody>
            {(this.props as any).value.managedServices.map((service: any) => {
              return (<tr key={service.service}>
                <td style={{
                  cursor: 'pointer',
                  backgroundColor: this.isSelected(service) ? '#343a40' : '',
                  color: this.isSelected(service) ? 'white' : 'black',
                }} onClick={() => this.select(service)}>
                  <span>{service.name}</span>
                </td>
              </tr>);
            })}
          </tbody>
        </table>
      </div>
      <div style={{ width: '70%', height: '100%', paddingLeft: 20 }}>
        {!!this.state.selected && (<div>
          <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={this.deletePlan} type="button" className="btn btn-sm btn-outline-secondary" style={{ marginBottom: 10 }}>
              <i className="fas fa-trash" /> delete service
            </button>
          </div>
          Service
        </div>)}
        {!this.state.selected && (<div>
          <p>choose a service to edit/delete it or create a new one !</p>
        </div>)}
      </div>
    </div>);
  }
}
