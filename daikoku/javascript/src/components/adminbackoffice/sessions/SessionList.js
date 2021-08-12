import React, { useContext } from 'react';
import { connect } from 'react-redux';
import moment from 'moment';

import * as Services from '../../../services';

import { Translation } from '../../../locales';
import { UserBackOffice } from '../../backoffice';
import { Table } from '../../inputs';
import { Can, manage, daikoku } from '../../utils';
import { I18nContext } from '../../../core';

function SessionListComponent(props) {
  const { translateMethod } = useContext(I18nContext);

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
      accessor: (item) => moment(item.created).formatranslateMethod('YYYY-MM-DD HH:mm:ss.SSS'),
    },
    {
      Header: translateMethod('Expires'),
      style: { textAlign: 'left' },
      accessor: (item) => moment(item.expires).formatranslateMethod('YYYY-MM-DD HH:mm:ss.SSS'),
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
              onClick={() => deleteSession(session)}>
              <i className="fas fa-trash" />
            </button>
          </div>
        );
      },
    },
  ];

  const deleteSession = (session) => {
    window
      .confirm(
        t(
          'destroy.session.confirm',
          props.currentLanguage,
          'Are you sure you want to destroy this session ?'
        )
      )
      .then((ok) => {
        if (ok) {
          Services.deleteSession(session._id).then(() => {
            if (table) {
              table.update();
              if (props.connectedUser._id === session.userId) {
                window.location.reload();
              }
            }
          });
        }
      });
  };

  const deleteSessions = () => {
    window
      .confirm(
        t(
          'destroy.all.sessions.confirm',
          props.currentLanguage,
          'Are you sure you want to destroy all sessions including yours ?'
        )
      )
      .then((ok) => {
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
    <UserBackOffice tab="User sessions">
      <Can I={manage} a={daikoku} dispatchError>
        <div className="row">
          <div className="col">
            <h1>
              <Translation i18nkey="User sessions">
                User sessions
              </Translation>
            </h1>
            <div className="section p-2">
              <Table
                currentLanguage={props.currentLanguage}
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
                    onClick={() => deleteSessions()}>
                    <i className="fas fa-trash mr-1" />
                    <Translation
                      i18nkey="Delete all sessions"
                    >
                      Delete all sessions
                    </Translation>
                  </button>
                )}
              />
            </div>
          </div>
        </div>
      </Can>
    </UserBackOffice>
  );
}

const mapStateToProps = (state) => ({
  ...state.context,
});

export const SessionList = connect(mapStateToProps)(SessionListComponent);
