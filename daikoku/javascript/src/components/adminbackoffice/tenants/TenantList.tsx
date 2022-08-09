import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import sortBy from 'lodash/sortBy';

import * as Services from '../../../services';
import { PaginatedComponent, AvatarWithAction, Can, manage, daikoku } from '../../utils';
import { I18nContext } from '../../../core';
import { useDaikokuBackOffice } from '../../../contexts';

export const TenantList = () => {
  useDaikokuBackOffice();
  const [tenants, setTenants] = useState([]);
  const [search, setSearch] = useState<string>();

  const navigate = useNavigate();

  useEffect(() => {
    getTenants();
  }, []);

  const { translateMethod, Translation } = useContext(I18nContext);

  const getTenants = () => Services.allTenants().then(setTenants);

  const createNewTenant = () => {
    Services.fetchNewTenant().then((newTenant) => {
      navigate(`/settings/tenants/${newTenant._id}`, {
        state: {
          newTenant,
        },
      });
    });
  };

  const removeTenant = (tenantId: any) => {
    (window.confirm(translateMethod('delete.tenant.confirm')) as any).then((ok: any) => {
      if (ok) {
        Services.deleteTenant(tenantId).then(() => getTenants());
      }
    });
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
            <a className="btn btn-sm btn-access-negative mb-1 ms-1" title={translateMethod('Create a new tenant')} href="#" onClick={(e) => {
              e.preventDefault();
              createNewTenant();
            }}>
              <i className="fas fa-plus-circle" />
            </a>
          </h1>
          <div className="col-5">
            <input placeholder={translateMethod('Find a tenant')} className="form-control" onChange={(e) => {
              setSearch(e.target.value);
            }} />
          </div>
        </div>
        <PaginatedComponent items={sortBy(filteredTenants, [(tenant) => (tenant as any).name.toLowerCase()])} count={15} formatter={(tenant) => {
          return (<AvatarWithAction key={tenant._id} avatar={tenant.style.logo} infos={<>
            <span className="text-truncate">{tenant.name}</span>
          </>} actions={[
            {
              action: () => removeTenant(tenant._id),
              iconClass: 'fas fa-trash delete-icon',
              tooltip: translateMethod('Remove tenant'),
            },
            {
              redirect: () => navigate(`/settings/tenants/${tenant._humanReadableId}`),
              iconClass: 'fas fa-pen',
              tooltip: translateMethod('Edit tenant'),
            },
            {
              link: `/api/tenants/${tenant._id}/_redirect`,
              iconClass: 'fas fa-link',
              tooltip: translateMethod('Go to tenant'),
            },
            {
              redirect: () => navigate(`/settings/tenants/${tenant._humanReadableId}/admins`),
              iconClass: 'fas fa-user-shield',
              tooltip: translateMethod('Admins'),
            },
          ]} />);
        }} />
      </div>
    </div>
  </Can>);
};
