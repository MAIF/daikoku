import React, { useContext, useEffect, useState } from 'react';
import moment from 'moment';

import { Table } from '../../inputs';
import { OtoDatePicker } from '../../inputs/datepicker';
import * as Services from '../../../services';
import { Can, manage, tenant } from '../../utils';
import { ModalContext, useTenantBackOffice } from '../../../contexts';
import { I18nContext } from '../../../core';

export const AuditTrailList = () => {
  useTenantBackOffice();

  const { alert } = useContext(ModalContext);
  const { translate } = useContext(I18nContext);

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
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={() => alert({
              title: translate('Event.details.modal.title'),
              message: <pre style={{ backgroundColor: '#eeeeee', padding: 10 }}>
                {JSON.stringify(value, null, 2)}
              </pre>
            })}
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
    return <OtoDatePicker updateDateRange={updateDateRange} from={from} to={to} />;
  };

  const fetchItems = () => {
    return Services.fetchAuditTrail(from.valueOf(), to.valueOf(), page, size).then(
      (resp) => resp.events
    );
  };

  return (
    <Can I={manage} a={tenant} dispatchError>
      <div className="row">
        <div className="col">
          <h1>Audit trail </h1>
          <div className="section">
            <div className="p-2">
              <Table
                columns={columns}
                fetchItems={fetchItems}
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
