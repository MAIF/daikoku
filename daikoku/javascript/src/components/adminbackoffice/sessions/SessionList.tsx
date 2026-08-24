import { useContext } from 'react';

import * as Services from '../../../services';

import { useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { ModalContext, useDaikokuBackOffice } from '../../../contexts';
import { I18nContext } from '../../../contexts/i18n-context';
import { GlobalContext } from '../../../contexts/globalContext';
import { ISession } from '../../../types';
import { clientFetchData, DynamicTable, DynamicTableFeatures, FilterDef } from '../../inputs';
import { Can, daikoku, formatDate, manage } from '../../utils';
import { Trash2 } from "lucide-react";

export const SessionList = () => {
  const { connectedUser } = useContext(GlobalContext)
    ;
  useDaikokuBackOffice();

  const { translate, Translation } = useContext(I18nContext);
  const { confirm } = useContext(ModalContext);

  const queryClient = useQueryClient();
  const queryKey = ['sessions'];

  const columnHelper = createColumnHelper<DynamicTableFeatures, ISession>();
  const columns = [
    columnHelper.accessor(row => `${row.userName} - ${row.userEmail}`, {
      id: 'user',
      meta: { title: translate('User'), size: 20 },
    }),
    columnHelper.accessor(row => (row.impersonatorId ? `${row.impersonatorName} - ${row.impersonatorEmail}` : ''), {
      id: 'impersonator',
      meta: { title: translate('Impersonator'), size: 20 },
    }),
    columnHelper.accessor(row => formatDate(row.created, translate('date.locale'), translate('date.format.short.millis')), {
      id: 'created',
      meta: { title: translate('Created at'), size: 15 },
    }),
    columnHelper.accessor(row => formatDate(row.expires, translate('date.locale'), translate('date.format.short.millis')), {
      id: 'expires',
      meta: { title: translate('Expires'), size: 15 },
    }),
    columnHelper.display({
      id: 'actions',
      meta: { title: translate('Actions'), size: 8, className: 'action-cell' },
      cell: (info) => {
        const session = info.row.original;
        return (
          <div className="d-flex justify-content-end">
            <button
              type="button"
              className="btn --secondary --small --icon-only"
              title="Delete this session"
              onClick={() => deleteSession(session)}
            >
              <Trash2 />
            </button>
          </div>
        );
      },
    }),
  ];

  const fetchData = clientFetchData<ISession>(
    () => Services.getSessions(),
    {
      searchable: (s) => [s.userName, s.userEmail, s.impersonatorName, s.impersonatorEmail],
      // The date columns render a formatted string: sort on the raw timestamps
      // so the order is chronological rather than lexicographic.
      sortValues: {
        user: (s) => `${s.userName} - ${s.userEmail}`,
        impersonator: (s) => s.impersonatorName ?? '',
        created: (s) => s.created,
        expires: (s) => s.expires,
      },
    }
  );

  const filters: FilterDef[] = [
    { id: 'search', type: 'text', placeholder: translate('Search') },
  ];

  const deleteSession = (session: ISession) => {
    (confirm({ message: translate('destroy.session.confirm') }))
      .then((ok) => {
        if (ok) {
          Services.deleteSession(session._id)
            .then(() => {
              queryClient.invalidateQueries({ queryKey });
              if (connectedUser._id === session.userId) {
                window.location.reload();
              }
            });
        }
      });
  };

  const deleteSessions = () => {
    (confirm({ message: translate('destroy.all.sessions.confirm') }))
      .then((ok) => {
        if (ok) {
          Services.deleteSessions().then(() => {
            queryClient.invalidateQueries({ queryKey });
            window.location.reload();
          });
        }
      });
  };

  return (
    <Can I={manage} a={daikoku} dispatchError>
      <div className="row">
        <div className="col">
          <h1>
            <Translation i18nkey="User sessions">User sessions</Translation>
          </h1>
          <div className="section p-2">
            <DynamicTable<ISession>
              queryKey={queryKey}
              columns={columns}
              fetchData={fetchData}
              filters={filters}
              defaultSorting={[{ id: 'created', desc: true }]}
              getRowId={row => row._id}
              getRowAriaLabel={row => row.userName}
              toolbar={(
                <button
                  type="button"
                  className="btn --tertiary"
                  title="Delete all session"
                  onClick={() => deleteSessions()}
                >
                  <Trash2 className="me-1" />
                  <Translation i18nkey="Delete all sessions">Delete all sessions</Translation>
                </button>
              )}
            />
          </div>
        </div>
      </div>
    </Can>
  );
};
