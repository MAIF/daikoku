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

  addNewService = () => {};

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
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    return (<div style={{ display: 'flex', width: '100%' }}>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div style={{
        width: '30%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: 5,
        backgroundColor: '#f6f7f7',
    }}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <button onClick={this.addNewPlan} type="button" className="btn btn-sm btn-outline-secondary" style={{ marginBottom: 10, width: '100%' }}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <i className="fas fa-plus"/> add a new service
          </button>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <table className="table table-striped table-bordered table-hover table-sm">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <thead className="thead-light">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <tr>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <th scope="col">Service name</th>
              </tr>
            </thead>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <tbody>
              {(this.props as any).value.managedServices.map((service: any) => {
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        return (<tr key={service.service}>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <td style={{
                cursor: 'pointer',
                backgroundColor: this.isSelected(service) ? '#343a40' : '',
                color: this.isSelected(service) ? 'white' : 'black',
            }} onClick={() => this.select(service)}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <span>{service.name}</span>
                    </td>
                  </tr>);
    })}
            </tbody>
          </table>
        </div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div style={{ width: '70%', heigth: '100%', paddingLeft: 20 }}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          {!!this.state.selected && (<div>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <button onClick={this.deletePlan} type="button" className="btn btn-sm btn-outline-secondary" style={{ marginBottom: 10 }}>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <i className="fas fa-trash"/> delete service
                </button>
              </div>
              Service
            </div>)}
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          {!this.state.selected && (<div>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <p>choose a service to edit/delete it or create a new one !</p>
            </div>)}
        </div>
      </div>);
  }
}
