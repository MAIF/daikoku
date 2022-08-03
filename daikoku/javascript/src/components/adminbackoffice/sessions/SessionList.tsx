import React, { useContext } from 'react';
import { useSelector } from 'react-redux';
import moment from 'moment';

import * as Services from '../../../services';

import { Table } from '../../inputs';
import { Can, manage, daikoku } from '../../utils';
// @ts-expect-error TS(6142): Module '../../../locales/i18n-context' was resolve... Remove this comment to see the full error message
import { I18nContext } from '../../../locales/i18n-context';
import { useDaikokuBackOffice } from '../../../contexts';

export const SessionList = () => {
  const connectedUser = useSelector((s) => (s as any).context.connectedUser);
  useDaikokuBackOffice();

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, Translation } = useContext(I18nContext);

  let table: any;
  const columns = [
    {
      Header: translateMethod('User'),
      style: { textAlign: 'left' },
      accessor: (item: any) => item.userName + ' - ' + item.userEmail,
    },
    {
      Header: translateMethod('Impersonator'),
      style: { textAlign: 'left' },
      accessor: (item: any) => item.impersonatorId ? `${item.impersonatorName} - ${item.impersonatorEmail}` : '',
    },
    {
      Header: translateMethod('Created at'),
      style: { textAlign: 'left' },
      accessor: (item: any) => moment(item.created).format('YYYY-MM-DD HH:mm:ss.SSS'),
    },
    {
      Header: translateMethod('Expires'),
      style: { textAlign: 'left' },
      accessor: (item: any) => moment(item.expires).format('YYYY-MM-DD HH:mm:ss.SSS'),
    },
    {
      Header: translateMethod('Actions'),
      style: { textAlign: 'center' },
      disableSortBy: true,
      disableFilters: true,
      content: (item: any) => item._id,
      Cell: ({
        cell: {
          row: { original },
        }
      }: any) => {
        const session = original;
        return (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <div className="btn-group">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              title="Delete this session"
              onClick={() => deleteSession(session)}
            >
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <i className="fas fa-trash" />
            </button>
          </div>
        );
      },
    },
  ];

  const deleteSession = (session: any) => {
    (window.confirm(translateMethod('destroy.session.confirm')) as any).then((ok: any) => {
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
    (window.confirm(translateMethod('destroy.all.sessions.confirm')) as any).then((ok: any) => {
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
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Can I={manage} a={daikoku} dispatchError>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="row">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="col">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <h1>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Translation i18nkey="User sessions">User sessions</Translation>
          </h1>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="section p-2">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Table
              // @ts-expect-error TS(2322): Type '{ selfUrl: string; defaultTitle: string; def... Remove this comment to see the full error message
              selfUrl="sessions"
              defaultTitle="User sessions"
              defaultValue={() => ({})}
              itemName="sessions"
              columns={columns}
              fetchItems={() => Services.getSessions()}
              showActions={false}
              showLink={false}
              injectTable={(t: any) => table = t}
              extractKey={(item: any) => item._id}
              injectTopBar={() => (
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  title="Delete all session"
                  style={{ marginLeft: 10 }}
                  onClick={() => deleteSessions()}
                >
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <i className="fas fa-trash me-1" />
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
