import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnFiltersState, createColumnHelper, flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, PaginationState, SortingState, useReactTable } from "@tanstack/react-table";
import classNames from 'classnames';
import { subHours } from 'date-fns';
import { GraphQLClient } from "graphql-request";
import { useContext, useMemo, useState } from "react";
import Pagination from 'react-paginate';

import { I18nContext, ModalContext, useTenantBackOffice } from '../../../contexts';
import * as Services from '../../../services';
import { IAuditTrailEventGQL } from '../../../types';
import { Filter } from '../../inputs';
import { OtoDatePicker } from '../../inputs/datepicker';
import { Can, formatDate, manage, tenant } from '../../utils';
import { GlobalContext } from "../../../contexts/globalContext";

type NotificationColumnMeta = {
  style?: { [x: string]: string };
};
declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends unknown, TValue> extends NotificationColumnMeta { }
}

export const AuditTrailList = () => {
  useTenantBackOffice();
  const queryClient = useQueryClient();

  const { alert } = useContext(ModalContext);
  const { translate } = useContext(I18nContext);
  const { customGraphQLClient } = useContext(GlobalContext);

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    []
  )
  const [from, setFrom] = useState(subHours(new Date(), 1));
  const [to, setTo] = useState(new Date());


  const auditTrailQuery = useQuery({
    queryKey: ["audits", from, to, columnFilters, sorting, pagination],
    queryFn: () => customGraphQLClient.request<{ auditTrail: { events: Array<IAuditTrailEventGQL>, total: number } }>(Services.graphql.getAuditTrail, {
      from: from.getTime(),
      to: to.getTime(),
      filterTable: JSON.stringify([...(columnFilters ?? [])]),
      sortingTable: JSON.stringify(sorting ?? []),
      limit: pagination.pageSize,
      offset: pagination.pageIndex * pagination.pageSize,
    }),
    select: d => d.auditTrail
  });


  const columnHelper = createColumnHelper<IAuditTrailEventGQL>();
  const columns = [
    columnHelper.accessor('event_timestamp', {
      header: translate('Date'),
      id: 'date',
      enableColumnFilter: false,
      meta: { style: { textAlign: 'left' } },
      cell: (info) => {
        const item = info.getValue();
        const value: number = item['$long'] ?? item
        return formatDate(value, translate('date.locale'), "dd/MM/yyyy HH:mm:ss.SSS OOOO");
      },
    }),
    columnHelper.accessor(row => row.user.name, {
      id: 'user',
      header: translate('User'),
      meta: { style: { textAlign: 'left' } }
    }),
    columnHelper.accessor(row => row.impersonator?.name, {
      id: 'impersonator',
      header: translate('Impersonator'),
      enableSorting: false,
      meta: { style: { textAlign: 'left' } },
      cell: (info) => info.getValue() || ''
    }),
    columnHelper.accessor('message', {
      id: 'message',
      header: translate('Message'),
      enableSorting: false,
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
            className="btn btn-sm btn-outline-info"
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

  const defaultData = useMemo(() => [], [])
  const table = useReactTable({
    data: auditTrailQuery.data?.events ?? defaultData,
    columns: columns,
    rowCount: auditTrailQuery.data?.total,
    state: {
      pagination,
      columnFilters,
      sorting
    },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })



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
          <table className="reactTableV7 mt-3">
            <thead>
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => {
                    return (
                      <th
                        key={header.id}
                        colSpan={header.colSpan}
                        className={classNames({
                          '--sort-asc': header.column.getIsSorted() === 'asc',
                          '--sort-desc': header.column.getIsSorted() === 'desc',
                        })}>
                        {header.isPlaceholder ? null : (
                          <div onClick={header.column.getToggleSortingHandler()}>
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                          </div>
                        )}
                        {header.column.getCanFilter() && <div className='my-2'>
                          <Filter column={header.column} table={table} />
                        </div>}
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map(row => {
                return (
                  <tr key={row.id}>
                    {row.getVisibleCells().map(cell => {
                      return (
                        <td key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
          <Pagination
            previousLabel={translate('Previous')}
            nextLabel={translate('Next')}
            breakLabel={'...'}
            breakClassName={'break'}
            pageCount={table.getPageCount()}
            marginPagesDisplayed={1}
            pageRangeDisplayed={5}
            onPageChange={(page) => table.setPageIndex(page.selected)}
            containerClassName={'pagination'}
            pageClassName={'page-selector'}
            activeClassName={'active'} />
        </section>
      </main>
    </Can>
  );
};
