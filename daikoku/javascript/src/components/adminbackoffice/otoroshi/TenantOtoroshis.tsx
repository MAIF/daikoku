import React, { useContext, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { nanoid } from 'nanoid';

import * as Services from '../../../services';
import { Table } from '../../inputs';
import { Can, manage, tenant as TENANT } from '../../utils';
import { toastr } from 'react-redux-toastr';
import { I18nContext } from '../../../locales/i18n-context';
import { useTenantBackOffice } from '../../../contexts';

export const TenantOtoroshis = () => {
  const { tenant, connectedUser } = useSelector((s) => (s as any).context);
  const { translate } = useContext(I18nContext);
  const navigate = useNavigate();

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
      Header: translate('Url'),
      style: { textAlign: 'left' },
      accessor: (item: any) => item.url,
    },
    {
      Header: translate('Host'),
      style: { textAlign: 'left' },
      accessor: (item: any) => item.host,
    },
    {
      Header: translate('Actions'),
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
          <div className="btn-group">
            {isTenantAdmin && (
              <Link to={`/settings/otoroshis/${otoroshi._id}`}>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  title={translate('Edit this settings')}
                >
                  <i className="fas fa-edit" />
                </button>
              </Link>
            )}
            {isTenantAdmin && (
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                title={translate('Delete this settings')}
                onClick={() => onDelete(otoroshi._id)}
              >
                <i className="fas fa-trash" />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  const onDelete = (id: any) => {
    (window.confirm(translate('otoroshi.settings.delete.confirm')) as any).then((ok: any) => {
      if (ok) {
        Services.deleteOtoroshiSettings(tenant._id, id)
          .then(() => {
            toastr.success(translate('Success'), translate('otoroshi.settings.deleted.success'));
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
    <Can I={manage} a={TENANT} dispatchError>
      <div>
        <button
          type="button"
          className="btn btn-sm btn-outline-success mb-1 ms-1"
          title={translate('Create new settings')}
          onClick={(e) => {
            createNewSettings();
          }}
        >
          Create new setting
        </button>
        <div className="section p-2">
          <Table
            defaultSort="Url"
            columns={columns}
            fetchItems={() => Services.allOtoroshis(tenant._id)}
            injectTable={(t: any) => table = t}
          />
        </div>
      </div>
    </Can>
  );
};
