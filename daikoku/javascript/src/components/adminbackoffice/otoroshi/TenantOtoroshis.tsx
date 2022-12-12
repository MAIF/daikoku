import React, { useContext, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { nanoid } from 'nanoid';

import * as Services from '../../../services';
import { Table, TableRef } from '../../inputs';
import { Can, manage, tenant as TENANT } from '../../utils';
import { toastr } from 'react-redux-toastr';
import { I18nContext } from '../../../contexts/i18n-context';
import { ModalContext, useTenantBackOffice } from '../../../contexts';
import { IOtoroshiSettings, isError, IState, IStateContext } from '../../../types';
import { createColumnHelper } from '@tanstack/react-table';

export const TenantOtoroshis = () => {
  const { tenant, connectedUser } = useSelector<IState, IStateContext>((s) => s.context);
  const { translate } = useContext(I18nContext);
  const { confirm } = useContext(ModalContext);
  const navigate = useNavigate();

  useTenantBackOffice();

  const [isTenantAdmin, setIsTenantAdmin] = useState(connectedUser.isDaikokuAdmin);
  const table = useRef<TableRef>()

  useEffect(() => {
    if (!isTenantAdmin)
      Services.tenantAdmins(tenant._id)
        .then((res) => {
          if (!isError(res)) {
            setIsTenantAdmin(!!res.admins.find((admin) => admin._id === connectedUser._id));
          }
        });
  }, []);

  const columnHelper = createColumnHelper<IOtoroshiSettings>();
  const columns = [
    columnHelper.accessor("url", {
      header: translate('Url'),
    }),
    columnHelper.accessor("host", {
      header: translate('Host'),
    }),
    columnHelper.display({
      header: translate('Actions'),
      meta: {style: { textAlign: 'center' }},
      enableColumnFilter: false,
      enableSorting: false,
      cell: (info) => {
        const otoroshi = info.row.original;
        return (
          <div >
            {isTenantAdmin && (
              <Link to={`/settings/otoroshis/${otoroshi._id}`}>
                <button
                  type="button"
                  className="btn btn-outline-primary me-1"
                  title={translate('Edit this settings')}
                >
                  <i className="fas fa-edit" />
                </button>
              </Link>
            )}
            {isTenantAdmin && (
              <button
                type="button"
                className="btn btn-outline-danger"
                title={translate('Delete this settings')}
                onClick={() => onDelete(otoroshi._id)}
              >
                <i className="fas fa-trash" />
              </button>
            )}
          </div>
        );
      },
    }),
  ];

  const onDelete = (id: string) => {
    (confirm({ message: translate('otoroshi.settings.delete.confirm') }))
      .then((ok) => {
        if (ok) {
          Services.deleteOtoroshiSettings(tenant._id, id)
            .then(() => {
              toastr.success(translate('Success'), translate('otoroshi.settings.deleted.success'));
              table.current?.update();
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
          title={translate('otoroshi.list.add.label')}
          onClick={(e) => {
            createNewSettings();
          }}
        >
          {translate('otoroshi.list.add.label')}
        </button>
        <div className="section p-2">
          <Table
            defaultSort="Url"
            columns={columns}
            fetchItems={() => Services.allOtoroshis(tenant._id)}
            ref={table}
          />
        </div>
      </div>
    </Can>
  );
};
