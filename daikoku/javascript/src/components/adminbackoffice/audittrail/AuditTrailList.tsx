import React, { useEffect, useState } from 'react';
import moment from 'moment';

import { Table } from '../../inputs';
// @ts-expect-error TS(6142): Module '../../inputs/datepicker' was resolved to '... Remove this comment to see the full error message
import { OtoDatePicker } from '../../inputs/datepicker';
import * as Services from '../../../services';
import { Can, manage, tenant } from '../../utils';
import { useTenantBackOffice } from '../../../contexts';

export const AuditTrailList = () => {
  // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
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
      accessor: (item: any) => item['@timestamp']['$long'] ? item['@timestamp']['$long'] : item['@timestamp'], //todo: try to remove this $long prop from reactivemongo
      style: { textAlign: 'left' },
      Cell: ({
        value
      }: any) => {
        return moment(value).format('YYYY-MM-DD HH:mm:ss.SSS');
      },
    },
    {
      Header: 'Name',
      style: { textAlign: 'left' },
      accessor: (item: any) => item.user.name,
    },
    {
      Header: 'Impersonator',
      style: { textAlign: 'left' },
      accessor: (item: any) => item.impersonator ? item.impersonator.name : '',
    },
    {
      Header: 'Message',
      style: { textAlign: 'left' },
      accessor: (item: any) => item.message,
    },
    {
      Header: 'Actions',
      style: { textAlign: 'center' },
      disableSortBy: true,
      disableFilters: true,
      accessor: (item: any) => item._id,
      Cell: ({
        cell: {
          row: { original },
        }
      }: any) => {
        const value = original;
        return (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={() => {
              window.alert(
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <pre style={{ backgroundColor: '#eeeeee', padding: 10 }}>
                  {JSON.stringify(value, null, 2)}
                </pre>,
                // @ts-expect-error TS(2554): Expected 0-1 arguments, but got 2.
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
    update();
  }, [from, to, page]);

  const update = () => {
    if (table) {
      (table as any).update();
    }
  };

  const updateDateRange = (from: any, to: any) => {
    setFrom(from);
    setTo(to);
  };

  const topBar = () => {
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    return <OtoDatePicker updateDateRange={updateDateRange} from={from} to={to} />;
  };

  const fetchItems = () => {
    return Services.fetchAuditTrail(from.valueOf(), to.valueOf(), page, size).then(
      (resp) => resp.events
    );
  };

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Can I={manage} a={tenant} dispatchError>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="row">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="col">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <h1>Audit trail </h1>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="section">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="p-2">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Table
                // @ts-expect-error TS(2322): Type '{ selfUrl: string; defaultTitle: string; def... Remove this comment to see the full error message
                selfUrl="audit"
                defaultTitle="Audit trail"
                defaultValue={() => ({})}
                itemName="event"
                columns={columns}
                fetchItems={fetchItems}
                showActions={false}
                showLink={false}
                extractKey={(item: any) => item._id}
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
};
