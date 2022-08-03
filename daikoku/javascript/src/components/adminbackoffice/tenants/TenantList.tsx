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
  const [search, setSearch] = useState();

  const navigate = useNavigate();

  useEffect(() => {
    // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
    getTenants();
  }, []);

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, Translation } = useContext(I18nContext);

  const getTenants = (_: any) => Services.allTenants().then(setTenants);

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
        // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
        Services.deleteTenant(tenantId).then(() => getTenants());
    }
});
  };

  const filteredTenants = search
    ? tenants.filter(({ name }) => (name as any).toLowerCase().includes(search))
    : tenants;
  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return (<Can I={manage} a={daikoku} dispatchError>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="row">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="col">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="d-flex justify-content-between align-items-center">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <h1>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Translation i18nkey="Tenant" isPlural>
                Tenants
              </Translation>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <a className="btn btn-sm btn-access-negative mb-1 ms-1" title={translateMethod('Create a new tenant')} href="#" onClick={(e) => {
        e.preventDefault();
        createNewTenant();
    }}>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <i className="fas fa-plus-circle"/>
              </a>
            </h1>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="col-5">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <input placeholder={translateMethod('Find a tenant')} className="form-control" onChange={(e) => {
        // @ts-expect-error TS(2345): Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
        setSearch(e.target.value);
    }}/>
            </div>
          </div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <PaginatedComponent items={sortBy(filteredTenants, [(tenant) => (tenant as any).name.toLowerCase()])} count={15} formatter={(tenant) => {
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        return (<AvatarWithAction key={tenant._id} avatar={tenant.style.logo} infos={<>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <span className="text-truncate">{tenant.name}</span>
                    </>} actions={[
                {
                    action: () => removeTenant(tenant._id),
                    iconClass: 'fas fa-trash delete-icon',
                    tooltip: translateMethod('Remove tenant'),
                },
                {
                    // @ts-expect-error TS(2322): Type '{ redirect: () => void; iconClass: string; t... Remove this comment to see the full error message
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
                    // @ts-expect-error TS(2322): Type '{ redirect: () => void; iconClass: string; t... Remove this comment to see the full error message
                    redirect: () => navigate(`/settings/tenants/${tenant._humanReadableId}/admins`),
                    iconClass: 'fas fa-user-shield',
                    tooltip: translateMethod('Admins'),
                },
            ]}/>);
    }}/>
        </div>
      </div>
    </Can>);
};
