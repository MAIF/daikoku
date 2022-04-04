import React, { useContext, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { connect, useSelector } from 'react-redux';
import { v4 as uuid } from 'uuid';
import faker from 'faker';

import * as Services from '../../../services';
import { Table } from '../../inputs';
import { UserBackOffice } from '../../backoffice';
import { Can, manage, tenant as TENANT } from '../../utils';
import { toastr } from 'react-redux-toastr';
import { I18nContext } from '../../../locales/i18n-context';
import { useTenantBackOffice } from '../../../contexts';

export const TenantOtoroshis = () => {
  const { tenant, connectedUser } = useSelector(s => s.context);
  const { translateMethod, Translation } = useContext(I18nContext);
  const navigate = useNavigate();

  useTenantBackOffice();

  const [isTenantAdmin, setIsTenantAdmin] = useState(connectedUser.isDaikokuAdmin);

  useEffect(() => {
    if (!isTenantAdmin)
      Services.tenantAdmins(tenant._id)
        .then((res) => {
          if (res.admins)
            setIsTenantAdmin(res.admins.find((admin) => admin._id === connectedUser._id));
        });
  }, []);

  let table;

  const columns = [
    {
      Header: translateMethod('Url'),
      style: { textAlign: 'left' },
      accessor: (item) => item.url,
    },
    {
      Header: translateMethod('Host'),
      style: { textAlign: 'left' },
      accessor: (item) => item.host,
    },
    {
      Header: translateMethod('Actions'),
      style: { textAlign: 'center' },
      disableSortBy: true,
      disableFilters: true,
      accessor: (item) => item._id,
      Cell: ({
        cell: {
          row: { original },
        },
      }) => {
        const otoroshi = original;
        return (
          <div className="btn-group">
            {isTenantAdmin && (
              <Link to={`/settings/otoroshis/${otoroshi._id}`}>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  title={translateMethod('Edit this settings')}
                >
                  <i className="fas fa-edit" />
                </button>
              </Link>
            )}
            {isTenantAdmin && (
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                title={translateMethod('Delete this settings')}
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

  const onDelete = (id) => {
    window.confirm(translateMethod('otoroshi.settings.delete.confirm')).then((ok) => {
      if (ok) {
        Services.deleteOtoroshiSettings(tenant._id, id).then(() => {
          toastr.success(translateMethod('otoroshi.settings.deleted.success'));
          table.update();
        });
      }
    });
  };

  const createNewSettings = () => {
    const settings = {
      _id: uuid(),
      url: 'https://otoroshi-api.foo.bar',
      host: 'otoroshi-api.foo.bar',
      clientId: faker.random.alphaNumeric(16),
      clientSecret: faker.random.alphaNumeric(64),
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
            type='button'
            className="btn btn-sm btn-access-negative mb-1 ms-1"
            title={translateMethod('Create new settings')}
            onClick={(e) => {
              createNewSettings();
            }}
          >
            Create new setting
          </button>
          <div className="section p-2">
            <Table
              selfUrl="otoroshis"
              defaultTitle="Otoroshi instances"
              defaultValue={() => ({})}
              defaultSort="Url"
              itemName="otoroshi"
              columns={columns}
              fetchItems={() => Services.allOtoroshis(tenant._id)}
              showActions={false}
              showLink={false}
              extractKey={(item) => item._id}
              injectTable={(t) => (table = t)}
            />
          </div>
        </div>
    </Can>
  );
}
