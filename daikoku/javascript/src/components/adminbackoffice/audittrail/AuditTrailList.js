import React, { useEffect, useState } from 'react';
import moment from 'moment';

import { Table } from '../../inputs';
import { OtoDatePicker } from '../../inputs/datepicker';
import * as Services from '../../../services';
import { UserBackOffice } from '../../backoffice';
import { Can, manage, tenant } from '../../utils';
import { useTenantBackOffice } from '../../../contexts';

export const AuditTrailList = () => {
  useTenantBackOffice();

  const [from, setFrom] = useState(moment().subtract(1, 'hour'));
  const [to, setTo] = useState(moment());
  const [table, setTable] = useState();
  const page = 1;
  const size = 500;

  const columns = [
    {
      Header: 'Date',
      id: 'date',
      accessor: (item) =>
        item['@timestamp']['$long'] ? item['@timestamp']['$long'] : item['@timestamp'], //todo: try to remove this $long prop from reactivemongo
      style: { textAlign: 'left' },
      Cell: ({ value }) => {
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
      style: { textAlign: 'left' },
      accessor: (item) => (item.impersonator ? item.impersonator.name : ''),
    },
    {
      Header: 'Message',
      style: { textAlign: 'left' },
      accessor: (item) => item.message,
    },
    {
      Header: 'Actions',
      style: { textAlign: 'center' },
      disableSortBy: true,
      disableFilters: true,
      accessor: (item) => item._id,
      Cell: ({
        cell: {
          row: { original },
        },
      }) => {
        const value = original;
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
            }}
          >
            Details
          </button>
        );
      },
    },
  ];

  useEffect(() => {
    update()
  }, [from, to, page])

  const update = () => {
    if (table) {
      table.update();
    }
  };

  const updateDateRange = (from, to) => {
    setFrom(from);
    setTo(to);
  };

  const topBar = () => {
    return (
      <OtoDatePicker
        updateDateRange={updateDateRange}
        from={from}
        to={to}
      />
    );
  };

  const fetchItems = () => {
    return Services.fetchAuditTrail(
      from.valueOf(),
      to.valueOf(),
      page,
      size)
      .then((resp) => resp.events);
  };

  return (
    <Can I={manage} a={tenant} dispatchError>
      <div className="row">
        <div className="col">
          <h1>Audit trail </h1>
          <div className="section">
            <div className="p-2">
              <Table
                selfUrl="audit"
                defaultTitle="Audit trail"
                defaultValue={() => ({})}
                itemName="event"
                columns={columns}
                fetchItems={fetchItems}
                showActions={false}
                showLink={false}
                extractKey={(item) => item._id}
                injectTable={setTable}
                defaultSort="date"
                defaultSortDesc={true}
                injectTopBar={topBar}
              />
            </div>
          </div>
        </div>
      </div>
    </Can>
  );
}
