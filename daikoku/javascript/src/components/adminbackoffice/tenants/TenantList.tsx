import sortBy from 'lodash/sortBy';
import { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { I18nContext, ModalContext, useDaikokuBackOffice } from '../../../contexts';
import * as Services from '../../../services';
import { ITenantFull } from '../../../types';
import { AvatarWithAction, Can, daikoku, manage, PaginatedComponent } from '../../utils';
import { Pen, Trash2, UserCheck, Link, Plus } from "lucide-react";

export const TenantList = () => {
  useDaikokuBackOffice();
  const [tenants, setTenants] = useState<ITenantFull[]>([]);
  const [search, setSearch] = useState<string>();

  const navigate = useNavigate();

  useEffect(() => {
    getTenants();
  }, []);

  const { translate, Translation } = useContext(I18nContext);
  const { confirm, alert } = useContext(ModalContext);

  const getTenants = () => Services.allTenants().then(setTenants);

  const createNewTenant = () => {
    Services.fetchNewTenant()
      .then((newTenant) => {
        navigate(`/settings/tenants/${newTenant._id}/general`, {
          state: {
            newTenant,
          },
        });
      });
  };

  const removeTenant = (tenantId: string) => {
    if (tenants.length === 1) {
      alert({ message: translate('delete.last.tenant.confirm') })
    } else {
      (confirm({ message: translate('delete.tenant.confirm') }))
        .then((ok) => {
          if (ok) {
            Services.deleteTenant(tenantId)
              .then(() => getTenants());
          }
        });
    }
  };

  const filteredTenants = search
    ? tenants.filter(({ name }) => (name as any).toLowerCase().includes(search))
    : tenants;
  return (<Can I={manage} a={daikoku} dispatchError>
    <div className="row">
      <div className="col">
        <div className="d-flex justify-content-between align-items-center">
          <h1>
            <Translation i18nkey="Tenant" isPlural>
              Tenants
            </Translation>
            <a className="btn --secondary --icon-only ms-2" title={translate('Create a new tenant')} href="#" onClick={(e) => {
              e.preventDefault();
              createNewTenant();
            }}>
              <Plus />
            </a>
          </h1>
          <div className="col-5">
            <input placeholder={translate('Find a tenant')} className="form-control" onChange={(e) => {
              setSearch(e.target.value);
            }} />
          </div>
        </div>
        <PaginatedComponent items={sortBy(filteredTenants, [(tenant) => (tenant as any).name.toLowerCase()])} count={15} formatter={(tenant) => {
          return (<AvatarWithAction key={tenant._id} avatar={tenant.style.logo} name={tenant.name} infos={<>
            <span className="text-truncate">{tenant.name}</span>
          </>} actions={[
            {
              action: () => removeTenant(tenant._id),
              icon: <Trash2 className="delete-icon" />,
              tooltip: translate('Remove tenant'),
            },
            {
              link: `/api/tenants/${tenant._id}/_redirect?path=/settings/settings/general`,
              icon: <Pen />,
              tooltip: translate('Edit tenant'),
            },
            {
              link: `/api/tenants/${tenant._id}/_redirect`,
              icon: <Link />,
              tooltip: translate('Go to tenant'),
            }
          ]} />);
        }} />
      </div>
    </div>
  </Can>);
};
