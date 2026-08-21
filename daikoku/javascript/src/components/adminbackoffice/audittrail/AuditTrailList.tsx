import { createColumnHelper } from "@tanstack/react-table";
import { subHours } from 'date-fns';
import { useContext, useState } from "react";

import { I18nContext, ModalContext, useTenantBackOffice } from '../../../contexts';
import { GlobalContext } from "../../../contexts/globalContext";
import * as Services from '../../../services';
import { IAuditTrailEventGQL } from '../../../types';
import { DynamicTable, DynamicTableFeatures, FetchData, FetchResult } from '../../inputs';
import { OtoDatePicker } from '../../inputs/datepicker';
import { Can, formatDate, manage, tenant } from '../../utils';

export const AuditTrailList = () => {
  useTenantBackOffice();

  const { alert } = useContext(ModalContext);
  const { translate } = useContext(I18nContext);
  const { customGraphQLClient } = useContext(GlobalContext);

  const pageSize = 25;

  const [from, setFrom] = useState(subHours(new Date(), 1));
  const [to, setTo] = useState(new Date());



  // ─── fetchData ──────────────────────────────────────────────────────────
  type IAuditTrailGQL = { events: Array<IAuditTrailEventGQL>, total: number }
  const fetchData: FetchData<IAuditTrailEventGQL> = ({ limit, offset, filters, sorting }) =>
    customGraphQLClient.request<{ auditTrail: IAuditTrailGQL }>(Services.graphql.getAuditTrail, {
      from: from.getTime(),
      to: to.getTime(),
      filterTable: JSON.stringify(filters),
      sortingTable: JSON.stringify(sorting),
      limit: limit,
      offset: offset,
    })
      .then(({ auditTrail }): FetchResult<IAuditTrailEventGQL> => {
        return {
          items: auditTrail.events,
          total: auditTrail.total,
        }
      })


  const columnHelper = createColumnHelper<DynamicTableFeatures, IAuditTrailEventGQL>();
  const columns = [
    columnHelper.accessor('event_timestamp', {
      id: 'date',
      enableColumnFilter: false,
      meta: { title: translate('Date'), style: { textAlign: 'left' } },
      cell: (info) => {
        const item = info.getValue();
        const value: number = item['$long'] ?? item
        return formatDate(value, translate('date.locale'), "dd/MM/yyyy HH:mm:ss.SSS OOOO");
      },
    }),
    columnHelper.accessor(row => row.user.name, {
      id: 'user',
      meta: { title: translate('User'), style: { textAlign: 'left' } }
    }),
    columnHelper.accessor(row => row.impersonator?.name, {
      id: 'impersonator',
      enableSorting: false,
      meta: { style: { textAlign: 'left' } },
      cell: (info) => info.getValue() || ''
    }),
    columnHelper.accessor('message', {
      id: 'message',
      enableSorting: false,
      meta: { title: translate('Message'), style: { textAlign: 'left' } },
    }),
    columnHelper.display({
      id: 'action',
      meta: { title: translate('Actions'), style: { textAlign: 'center', width: '120px' } },
      enableColumnFilter: false,
      enableSorting: false,
      cell: (info) => {
        const value = info.row.original;
        return (
          <button
            type="button"
            className="btn --secondary --small"
            onClick={() => alert({
              title: translate('Event.details.modal.title'),
              message: <pre style={{ backgroundColor: '#{"var(--level2_bg-color, #f8f9fa)"}', color: '#{"var(--level2_text-color, #6c757d)"}', padding: 10 }}>
                {JSON.stringify(value, null, 2)}
              </pre>
            })}
          >
            {translate('Event.details.modal.title')}
          </button>
        );
      },
    }),
  ];


  const updateDateRange = (from: Date, to: Date) => {
    setFrom(from);
    setTo(to);
  };
  return (
    <Can I={manage} a={tenant} dispatchError>
      <main>
        <h1>{translate('Audit trail')}</h1>
        <section className="section p-2">
          <OtoDatePicker updateDateRange={updateDateRange} from={from} to={to} />
          <DynamicTable<IAuditTrailEventGQL>
            queryKey={['auudit-events']}
            columns={columns}
            fetchData={fetchData}
            pageSize={pageSize}
            getRowId={row => row.id}
            getRowAriaLabel={row => row.message}
            countLabelKey="Event"
          />
        </section>
      </main>
    </Can>
  );
};
