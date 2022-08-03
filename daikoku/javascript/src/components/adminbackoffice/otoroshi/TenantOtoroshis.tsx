import React, { useContext, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { nanoid } from 'nanoid';

import * as Services from '../../../services';
import { Table } from '../../inputs';
import { Can, manage, tenant as TENANT } from '../../utils';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { toastr } from 'react-redux-toastr';
// @ts-expect-error TS(6142): Module '../../../locales/i18n-context' was resolve... Remove this comment to see the full error message
import { I18nContext } from '../../../locales/i18n-context';
import { useTenantBackOffice } from '../../../contexts';

export const TenantOtoroshis = () => {
  const { tenant, connectedUser } = useSelector((s) => (s as any).context);
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);
  const navigate = useNavigate();

  // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
  useTenantBackOffice();

  const [isTenantAdmin, setIsTenantAdmin] = useState(connectedUser.isDaikokuAdmin);

  useEffect(() => {
    if (!isTenantAdmin)
      Services.tenantAdmins(tenant._id).then((res) => {
        if (res.admins)
          setIsTenantAdmin(res.admins.find((admin: any) => admin._id === connectedUser._id));
      });
  }, []);

  let table: any;

  const columns = [
    {
      Header: translateMethod('Url'),
      style: { textAlign: 'left' },
      accessor: (item: any) => item.url,
    },
    {
      Header: translateMethod('Host'),
      style: { textAlign: 'left' },
      accessor: (item: any) => item.host,
    },
    {
      Header: translateMethod('Actions'),
      style: { textAlign: 'center' },
      disableSortBy: true,
      disableFilters: true,
      accessor: (item: any) => item._id,
      Cell: ({
        cell: {
          row: { original },
        }
      }: any) => {
        const otoroshi = original;
        return (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <div className="btn-group">
            {isTenantAdmin && (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <Link to={`/settings/otoroshis/${otoroshi._id}`}>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  title={translateMethod('Edit this settings')}
                >
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <i className="fas fa-edit" />
                </button>
              </Link>
            )}
            {isTenantAdmin && (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                title={translateMethod('Delete this settings')}
                onClick={() => onDelete(otoroshi._id)}
              >
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <i className="fas fa-trash" />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  const onDelete = (id: any) => {
    (window.confirm(translateMethod('otoroshi.settings.delete.confirm')) as any).then((ok: any) => {
    if (ok) {
        Services.deleteOtoroshiSettings(tenant._id, id)
            .then(() => {
            toastr.success(translateMethod('otoroshi.settings.deleted.success'));
            table.update();
        });
    }
});
  };

  const createNewSettings = () => {
    const settings = {
      _id: nanoid(32)
    };
    navigate(`/settings/otoroshis/${settings._id}`, {
      state: {
        newSettings: settings,
      },
    });
  };

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Can I={manage} a={TENANT} dispatchError>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button
          type="button"
          className="btn btn-sm btn-outline-success mb-1 ms-1"
          title={translateMethod('Create new settings')}
          onClick={(e) => {
            createNewSettings();
          }}
        >
          Create new setting
        </button>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="section p-2">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Table
            // @ts-expect-error TS(2322): Type '{ selfUrl: string; defaultTitle: string; def... Remove this comment to see the full error message
            selfUrl="otoroshis"
            defaultTitle="Otoroshi instances"
            defaultValue={() => ({})}
            defaultSort="Url"
            itemName="otoroshi"
            columns={columns}
            fetchItems={() => Services.allOtoroshis(tenant._id)}
            showActions={false}
            showLink={false}
            extractKey={(item: any) => item._id}
            injectTable={(t: any) => table = t}
          />
        </div>
      </div>
    </Can>
  );
};
