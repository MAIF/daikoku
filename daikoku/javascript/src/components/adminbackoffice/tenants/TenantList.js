import React, { useContext, useEffect, useState } from 'react';
import { connect } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import _ from 'lodash';
import * as Services from '../../../services';
import { UserBackOffice } from '../../backoffice';
import { PaginatedComponent, AvatarWithAction, Can, manage, daikoku } from '../../utils';
import { I18nContext } from '../../../core';

export function TenantListComponent(props) {
  const [state, setState] = useState({
    tenants: [],
  });

  const navigate = useNavigate();

  useEffect(() => {
    getTenants();
  }, []);

  const { translateMethod, Translation } = useContext(I18nContext);

  const getTenants = (_) =>
    Services.allTenants().then((tenants) => setState({ ...state, tenants }));

  const createNewTenant = () => {
    Services.fetchNewTenant().then((newTenant) => {
      navigate(`/settings/tenants/${newTenant._id}`, { newTenant });
    });
  };

  const removeTenant = (tenantId) => {
    window.confirm(translateMethod('delete.tenant.confirm')).then((ok) => {
      if (ok) {
        Services.deleteTenant(tenantId).then(() => getTenants());
      }
    });
  };

  const filteredTenants = state.search
    ? state.tenants.filter(({ name }) => name.toLowerCase().includes(state.search))
    : state.tenants;
  return (
    <UserBackOffice tab="Tenants">
      <Can I={manage} a={daikoku} dispatchError>
        <div className="row">
          <div className="col">
            <div className="d-flex justify-content-between align-items-center">
              <h1>
                <Translation i18nkey="Tenant" isPlural>
                  Tenants
                </Translation>
                <a
                  className="btn btn-sm btn-access-negative mb-1 ml-1"
                  title={translateMethod('Create a new tenant')}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    createNewTenant();
                  }}>
                  <i className="fas fa-plus-circle" />
                </a>
              </h1>
              <input
                placeholder={translateMethod('Find a tenant')}
                className="form-control col-5"
                onChange={(e) => {
                  setState({ ...state, search: e.target.value });
                }}
              />
            </div>
            <PaginatedComponent
              items={_.sortBy(filteredTenants, [(tenant) => tenant.name.toLowerCase()])}
              count={15}
              formatter={(tenant) => {
                return (
                  <AvatarWithAction
                    key={tenant._id}
                    avatar={tenant.style.logo}
                    infos={
                      <>
                        <span className="text-truncate">{tenant.name}</span>
                      </>
                    }
                    actions={[
                      {
                        action: () => removeTenant(tenant._id),
                        iconClass: 'fas fa-trash delete-icon',
                        tooltip: translateMethod('Remove tenant'),
                      },
                      {
                        redirect: () =>
                          navigate(`/settings/tenants/${tenant._humanReadableId}`),
                        iconClass: 'fas fa-pen',
                        tooltip: translateMethod('Edit tenant'),
                      },
                      {
                        link: `/api/tenants/${tenant._id}/_redirect`,
                        iconClass: 'fas fa-link',
                        tooltip: translateMethod('Go to tenant'),
                      },
                      {
                        redirect: () =>
                          navigate(`/settings/tenants/${tenant._humanReadableId}/admins`),
                        iconClass: 'fas fa-user-shield',
                        tooltip: translateMethod('Admins'),
                      },
                    ]}
                  />
                );
              }}
            />
          </div>
        </div>
      </Can>
    </UserBackOffice>
  );
}

const mapStateToProps = (state) => ({
  ...state.context,
});

export const TenantList = connect(mapStateToProps)(TenantListComponent);
