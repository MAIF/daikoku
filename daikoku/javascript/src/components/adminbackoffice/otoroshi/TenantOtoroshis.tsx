import { useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { nanoid } from 'nanoid';
import { useContext, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { ModalContext, useTenantBackOffice } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import { I18nContext } from '../../../contexts/i18n-context';
import * as Services from '../../../services';
import { IOtoroshiSettings, isError } from '../../../types';
import { clientFetchData, DynamicTable, DynamicTableFeatures, FilterDef } from '../../inputs';
import { Can, tenant as TENANT, manage } from '../../utils';
import { Pen, Trash2 } from "lucide-react";
import { FeedbackButton } from '../../utils/FeedbackButton';

export const TenantOtoroshis = () => {
  const { tenant, connectedUser } = useContext(GlobalContext);
  const { translate } = useContext(I18nContext);
  const { confirm } = useContext(ModalContext);
  const navigate = useNavigate();

  useTenantBackOffice();

  const [isTenantAdmin, setIsTenantAdmin] = useState(connectedUser.isDaikokuAdmin);
  const queryClient = useQueryClient();
  const queryKey = ['otoroshis', tenant._id];

  useEffect(() => {
    if (!isTenantAdmin)
      Services.tenantAdmins(tenant._id)
        .then((res) => {
          if (!isError(res)) {
            setIsTenantAdmin(!!res.admins.find((admin) => admin._id === connectedUser._id));
          }
        });
  }, []);

  const columnHelper = createColumnHelper<DynamicTableFeatures, IOtoroshiSettings>();
  const columns = [
    columnHelper.accessor("url", {
      meta: { title: translate('Url'), size: 20 },
    }),
    columnHelper.accessor("host", {
      meta: { title: translate('Host'), size: 20 },
    }),
    columnHelper.display({
      id: 'actions',
      meta: { title: translate('Actions'), size: 8, className: 'action-cell' },
      cell: (info) => {
        const otoroshi = info.row.original;
        return (
          <div className='d-flex justify-content-end gap-1'>
            {isTenantAdmin && (
              <Link to={`/settings/otoroshis/${otoroshi._id}`}>
                <button
                  type="button"
                  className="btn --tertiary --small --icon-only"
                  title={translate('Edit this settings')}
                >
                  <Pen />
                </button>
              </Link>
            )}
            {isTenantAdmin && (
              <FeedbackButton
                className="btn --tertiary --small --icon-only"
                title={translate('Delete this settings')}
                onPress={() => onDelete(otoroshi._id)}
              >
                <Trash2 />
              </FeedbackButton>
            )}
          </div>
        );
      },
    }),
  ];

  const fetchData = clientFetchData<IOtoroshiSettings>(
    () => Services.allOtoroshis(tenant._id),
    { searchable: (o) => [o.url, o.host] }
  );

  const filters: FilterDef[] = [
    { id: 'search', type: 'text', placeholder: translate('Search') },
  ];

  const onDelete = (id: string) => {
    return confirm({ message: translate('otoroshi.settings.delete.confirm') })
      .then((ok) => {
        if (ok) {
          Services.deleteOtoroshiSettings(tenant._id, id)
            .then(() => {
              toast.success(translate('otoroshi.settings.deleted.success'));
              queryClient.invalidateQueries({ queryKey });
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
          className="btn --primary mt-2"
          title={translate('otoroshi.list.add.label')}
          onClick={() => createNewSettings()}
        >
          {translate('otoroshi.list.add.label')}
        </button>
        <div className="section p-2">
          <DynamicTable<IOtoroshiSettings>
            queryKey={queryKey}
            columns={columns}
            fetchData={fetchData}
            filters={filters}
            defaultSorting={[{ id: 'url', desc: false }]}
            getRowId={row => row._id}
            getRowAriaLabel={row => row.url}
          />
        </div>
      </div>
    </Can>
  );
};
