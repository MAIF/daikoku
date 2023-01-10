import { createColumnHelper } from '@tanstack/react-table';
import { Row } from 'antd';
import dayjs from 'dayjs';
import moment from 'moment';
import { useContext, useEffect, useRef, useState } from 'react';

import { ModalContext, useTenantBackOffice } from '../../../contexts';
import { I18nContext } from '../../../core';
import * as Services from '../../../services';
import { IAuditTrailEvent, isError } from '../../../types';
import { Table, TableRef } from '../../inputs';
import { OtoDatePicker } from '../../inputs/datepicker';
import { Can, manage, tenant } from '../../utils';

export const AuditTrailList = () => {
  useTenantBackOffice();

  const table = useRef<TableRef>();

  const { alert } = useContext(ModalContext);
  const { translate } = useContext(I18nContext);

  const [from, setFrom] = useState(dayjs().subtract(1, 'hour'));
  const [to, setTo] = useState(dayjs());
  const page = 1;
  const size = 500;

  const columnHelper = createColumnHelper<IAuditTrailEvent>();
  const columns = [
    columnHelper.accessor('@timestamp', {
      header: translate('Date'),
      enableColumnFilter: false,
      meta: { style: { textAlign: 'left' } },
      cell: (info) => {
        const item = info.getValue;
        const value = info.getValue['$long'] ? item['@timestamp']['$long'] : item['@timestamp']
        return dayjs(value).format('YYYY-MM-DD HH:mm:ss.SSS');
      },
    }),
    columnHelper.accessor(row => row.user.name, {
      header: translate('User'),
      meta: { style: { textAlign: 'left' } }
    }),
    columnHelper.accessor(row => row.impersonator?.name, {
      header: translate('Impersonator'),
      meta: { style: { textAlign: 'left' } },
      cell: (info) => info.getValue() || ''
    }),
    columnHelper.accessor('message', {
      header: translate('Message'),
      meta: { style: { textAlign: 'left' } },
    }),
    columnHelper.display({
      header: translate('Actions'),
      meta: { style: { textAlign: 'center', width: '120px' } },
      enableColumnFilter: false,
      enableSorting: false,
      cell: (info) => {
        const value = info.row.original;
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
    }),
  ];

  useEffect(() => {
    table.current?.update();
  }, [from, to, page]);

  const updateDateRange = (from: dayjs.Dayjs, to: dayjs.Dayjs) => {
    setFrom(from);
    setTo(to);
  };

  const topBar = () => {
    return <OtoDatePicker updateDateRange={updateDateRange} from={from} to={to} />;
  };

  const fetchItems = () => {
    return Services.fetchAuditTrail(from.valueOf(), to.valueOf(), page, size)
      .then((resp) => {
        if (!isError(resp)) {
          return resp.events
        }
        return resp
      });
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
                ref={table}
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
