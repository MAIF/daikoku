import React, { Component } from 'react';
import { TableWithV7 } from '../../inputs';
import { OtoDatePicker } from '../../inputs/datepicker';
import * as Services from '../../../services';
import moment from 'moment';

import { UserBackOffice } from '../../backoffice';
import { Can, manage, tenant } from '../../utils';

export class AuditTrailList extends Component {
  state = {
    from: moment().subtract(1, 'hour'),
    to: moment(),
    page: 1,
    size: 500,
  };

  columns = [
    {
      Header: 'Date',
      accessor: (item) => item['@timestamp'],
      style: { textAlign: 'left' },
      cell: (value) => {
        return moment(value).format('YYYY-MM-DD HH:mm:ss.SSS');
      },
    },
    {
      Header: 'Name',
      style: { textAlign: 'left' },
      accessor: (item) => item.user.name,
    },
    {
      Header: 'Impersonator',
      style: { textAlign: 'left'},
      accessor: (item) => (item.impersonator ? item.impersonator.name : ''),
    },
    {
      Header: 'Message',
      style: {  textAlign: 'left' },
      accessor: (item) => item.message,
    },
    {
      Header: 'Actions',
      style: {  textAlign: 'center'},
      disableSortBy: true,
      disableFilters: true,
      accessor: (item) => item._id,
      Cell: ({ cell: { row: {original} } }) => {
        const value=original;
        return (
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={() => {
              window.alert(
                <pre style={{ backgroundColor: '#eeeeee', padding: 10 }}>
                  {JSON.stringify(value, null, 2)}
                </pre>,
                'Event details'
              );
            }}>
            Details
          </button>
        )
      },
    },
  ];

  componentDidMount() {
    this.update();
  }

  update = () => {
    if (this.table) {
      this.table.update();
    }
  };

  updateDateRange = (from, to) => {
    this.setState({ from, to }, () => {
      this.update();
    });
  };

  previous = () => {
    if (this.state.page > 1) {
      this.setState({ page: this.state.page - 1 });
      this.table.update();
    }
  };

  next = () => {
    this.setState({ page: this.state.page + 1 });
    this.table.update();
  };

  topBar = () => {
    return (
      <>
        <button
          type="button"
          className="btn btn-xs btn-outline-primary ml-2 mr-1"
          onClick={this.previous}>
          <i className="fas fa-arrow-left" />
        </button>
        ,<span> page </span>,
        <input
          type="number mr-1"
          style={{ width: 60, textAlign: 'center' }}
          value={this.state.page}
          onChange={(e) => {
            this.setState({ page: e.target.value });
            this.table.update();
          }}
        />
        ,<span> on {(this.state.total / this.state.size).toFixed(0)} with </span>,
        <input
          type="number"
          className="mr-1"
          style={{ width: 60, textAlign: 'center' }}
          value={this.state.size}
          onChange={(e) => {
            this.setState({ size: e.target.value });
            this.table.update();
          }}
        />
        ,<span> items per fetch</span>,
        <button type="button" className="btn btn-xs btn-outline-primary ml-1" onClick={this.next}>
          <i className="fas fa-arrow-right" />
        </button>
        ,
      </>
    );
  };

  fetchItems = () => {
    return Services.fetchAuditTrail(
      this.state.from.valueOf(),
      this.state.to.valueOf(),
      this.state.page,
      this.state.size
    ).then((resp) => {
      this.setState({ total: resp.size });
      return resp.events;
    });
  };

  render() {
    return (
      <UserBackOffice tab="Audit trail">
        <Can I={manage} a={tenant} dispatchError>
          <div className="row">
            <div className="col">
              <h1>Audit trail </h1>
              <div className="section">
                <div className="d-flex justify-content-end p-2">
                  <div className="section">
                    <OtoDatePicker
                      updateDateRange={this.updateDateRange}
                      from={this.state.from}
                      to={this.state.to}
                    />
                  </div>
                </div>
                <div className="p-2">
                  <TableWithV7
                    selfUrl="audit"
                    defaultTitle="Audit trail"
                    defaultValue={() => ({})}
                    itemName="event"
                    columns={this.columns}
                    fetchItems={this.fetchItems}
                    showActions={false}
                    showLink={false}
                    extractKey={(item) => item._id}
                    injectTable={(t) => (this.table = t)}
                    defaultSortDesc={true}
                    injectTopBar={this.topBar}
                  />
                </div>
              </div>
            </div>
          </div>
        </Can>
      </UserBackOffice>
    );
  }
}
