import React, { useContext } from 'react';
import { useSelector } from 'react-redux';
import moment from 'moment';

import * as Services from '../../../services';

import { Table } from '../../inputs';
import { Can, manage, daikoku } from '../../utils';
import { I18nContext } from '../../../locales/i18n-context';
import { useDaikokuBackOffice } from '../../../contexts';

export const SessionList = () => {
  const connectedUser = useSelector(s => s.context.connectedUser)
  useDaikokuBackOffice();

  const { translateMethod, Translation } = useContext(I18nContext);

  let table;
  const columns = [
    {
      Header: translateMethod('User'),
      style: { textAlign: 'left' },
      accessor: (item) => item.userName + ' - ' + item.userEmail,
    },
    {
      Header: translateMethod('Impersonator'),
      style: { textAlign: 'left' },
      accessor: (item) =>
        item.impersonatorId ? `${item.impersonatorName} - ${item.impersonatorEmail}` : '',
    },
    {
      Header: translateMethod('Created at'),
      style: { textAlign: 'left' },
      accessor: (item) => moment(item.created).format('YYYY-MM-DD HH:mm:ss.SSS'),
    },
    {
      Header: translateMethod('Expires'),
      style: { textAlign: 'left' },
      accessor: (item) => moment(item.expires).format('YYYY-MM-DD HH:mm:ss.SSS'),
    },
    {
      Header: translateMethod('Actions'),
      style: { textAlign: 'center' },
      disableSortBy: true,
      disableFilters: true,
      content: (item) => item._id,
      Cell: ({
        cell: {
          row: { original },
        },
      }) => {
        const session = original;
        return (
          <div className="btn-group">
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              title="Delete this session"
              onClick={() => deleteSession(session)}
            >
              <i className="fas fa-trash" />
            </button>
          </div>
        );
      },
    },
  ];

  const deleteSession = (session) => {
    window.confirm(translateMethod('destroy.session.confirm')).then((ok) => {
      if (ok) {
        Services.deleteSession(session._id).then(() => {
          if (table) {
            table.update();
            if (connectedUser._id === session.userId) {
              window.location.reload();
            }
          }
        });
      }
    });
  };

  const deleteSessions = () => {
    window.confirm(translateMethod('destroy.all.sessions.confirm')).then((ok) => {
      if (ok) {
        Services.deleteSessions().then(() => {
          if (table) {
            table.update();
            window.location.reload();
          }
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
            <Table
              selfUrl="sessions"
              defaultTitle="User sessions"
              defaultValue={() => ({})}
              itemName="sessions"
              columns={columns}
              fetchItems={() => Services.getSessions()}
              showActions={false}
              showLink={false}
              injectTable={(t) => (table = t)}
              extractKey={(item) => item._id}
              injectTopBar={() => (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  title="Delete all session"
                  style={{ marginLeft: 10 }}
                  onClick={() => deleteSessions()}
                >
                  <i className="fas fa-trash me-1" />
                  <Translation i18nkey="Delete all sessions">Delete all sessions</Translation>
                </button>
              )}
            />
          </div>
        </div>
      </div>
    </Can>
  );
}