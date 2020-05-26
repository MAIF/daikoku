import React, { Component } from 'react';
import { connect } from 'react-redux';
import moment from 'moment';

import * as Services from '../../../services';

import { t, Translation } from '../../../locales';
import { UserBackOffice } from '../../backoffice';
import { TableWithV7 } from '../../inputs';
import { Can, manage, daikoku } from '../../utils';

class SessionListComponent extends Component {
  columns = [
    {
      Header: t('User', this.props.currentLanguage),
      style: { textAlign: 'left'},
      accessor: (item) => item.userName + ' - ' + item.userEmail,
    },
    {
      Header: t('Impersonator', this.props.currentLanguage),
      style: { textAlign: 'left' },
      accessor: (item) =>
        item.impersonatorId ? `${item.impersonatorName} - ${item.impersonatorEmail}` : '',
    },
    {
      Header: t('Created at', this.props.currentLanguage),
      style: { textAlign: 'left' },
      accessor: (item) => moment(item.created).format('YYYY-MM-DD HH:mm:ss.SSS'),
    },
    {
      Header: t('Expires', this.props.currentLanguage),
      style: { textAlign: 'left'},
      accessor: (item) => moment(item.expires).format('YYYY-MM-DD HH:mm:ss.SSS'),
    },
    {
      Header: t('Actions', this.props.currentLanguage),
      style: { textAlign:'center' },
      disableSortBy: true,
      disableFilters: true,
      content: (item) => item._id,
      Cell: ({ cell: { row: {original} } }) => {
        const session = original;
        return (
            <div className="btn-group">
              <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  title="Delete this session"
                  onClick={() => this.deleteSession(session)}>
                <i className="fas fa-trash"/>
              </button>
            </div>
        )
      },
    },
  ];

  deleteSession = (session) => {
    window
      .confirm(
        t(
          'destroy.session.confirm',
          this.props.currentLanguage,
          'Are you sure you want to destroy this session ?'
        )
      )
      .then((ok) => {
        if (ok) {
          Services.deleteSession(session._id).then(() => {
            if (this.table) {
              this.table.update();
              if (this.props.connectedUser._id === session.userId) {
                window.location.reload();
              }
            }
          });
        }
      });
  };

  deleteSessions = () => {
    window
      .confirm(
        t(
          'destroy.all.sessions.confirm',
          this.props.currentLanguage,
          'Are you sure you want to destroy all sessions including yours ?'
        )
      )
      .then((ok) => {
        if (ok) {
          Services.deleteSessions().then(() => {
            if (this.table) {
              this.table.update();
              window.location.reload();
            }
          });
        }
      });
  };

  render() {
    return (
      <UserBackOffice tab="User sessions">
        <Can I={manage} a={daikoku} dispatchError>
          <div className="row">
            <div className="col">
              <h1>
                <Translation i18nkey="User sessions" language={this.props.currentLanguage}>
                  User sessions
                </Translation>
              </h1>
              <div className="section p-2">
                <TableWithV7
                  currentLanguage={this.props.currentLanguage}
                  selfUrl="sessions"
                  defaultTitle="User sessions"
                  defaultValue={() => ({})}
                  itemName="sessions"
                  columns={this.columns}
                  fetchItems={() => Services.getSessions()}
                  showActions={false}
                  showLink={false}
                  injectTable={(t) => (this.table = t)}
                  extractKey={(item) => item._id}
                  injectTopBar={() => (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      title="Delete all session"
                      style={{ marginLeft: 10 }}
                      onClick={() => this.deleteSessions()}>
                      <i className="fas fa-trash mr-1" />
                      <Translation
                        i18nkey="Delete all sessions"
                        language={this.props.currentLanguage}>
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
}

const mapStateToProps = (state) => ({
  ...state.context,
});

export const SessionList = connect(mapStateToProps)(SessionListComponent);
