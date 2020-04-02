import React, { Component } from 'react';
import { connect } from 'react-redux';
import _ from 'lodash';
import * as Services from '../../../services';
import { UserBackOffice } from '../../backoffice';
import { PaginatedComponent, AvatarWithAction, Can, manage, daikoku } from '../../utils';
import { t, Translation } from '../../../locales';

export class TenantListComponent extends Component {
  state = {
    tenants: [],
  };

  componentDidMount() {
    this.getTenants();
  }

  getTenants() {
    Services.allTenants().then(tenants => this.setState({ tenants }));
  }

  createNewTenant = () => {
    Services.fetchNewTenant().then(newTenant => {
      this.props.history.push(`/settings/tenants/${newTenant._id}`, { newTenant });
    });
  };

  removeTenant = tenantId => {
    window
      .confirm(
        t(
          'delete.tenant.confirm',
          this.props.currentLanguage,
          'Are you sure you want to delete this tenant ?'
        )
      )
      .then(ok => {
        if (ok) {
          Services.deleteTenant(tenantId).then(() => this.getTenants());
        }
      });
  };

  render() {
    const filteredTenants = this.state.search
      ? this.state.tenants.filter(({ name }) => name.toLowerCase().includes(this.state.search))
      : this.state.tenants;
    return (
      <UserBackOffice tab="Tenants">
        <Can I={manage} a={daikoku} dispatchError>
          <div className="row">
            <div className="col">
              <div className="d-flex justify-content-between align-items-center">
                <h1>
                  <Translation i18nkey="Tenant" language={this.props.currentLanguage} isPlural>
                    Tenants
                  </Translation>
                  <a
                    className="btn btn-sm btn-access-negative mb-1 ml-1"
                    title={t('Create a new tenant', this.props.currentLanguage)}
                    href="#"
                    onClick={e => {
                      e.preventDefault();
                      this.createNewTenant();
                    }}>
                    <i className="fas fa-plus-circle" />
                  </a>
                </h1>
                <input
                  placeholder={t('Find a tenant', this.props.currentLanguage)}
                  className="form-control col-5"
                  onChange={e => {
                    this.setState({ search: e.target.value });
                  }}
                />
              </div>
              <PaginatedComponent
                currentLanguage={this.props.currentLanguage}
                items={_.sortBy(filteredTenants, [tenant => tenant.name.toLowerCase()])}
                count={15}
                formatter={tenant => {
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
                          action: () => this.removeTenant(tenant._id),
                          iconClass: 'fas fa-trash delete-icon',
                          tooltip: t('Remove tenant', this.props.currentLanguage),
                        },
                        {
                          redirect: () =>
                            this.props.history.push(`/settings/tenants/${tenant._humanReadableId}`),
                          iconClass: 'fas fa-pen',
                          tooltip: t('Edit tenant', this.props.currentLanguage),
                        },
                        {
                          link: `/api/tenants/${tenant._id}/_redirect`,
                          iconClass: 'fas fa-link',
                          tooltip: t('Go to tenant', this.props.currentLanguage),
                        },
                        {
                          redirect: () =>
                            this.props.history.push(`/settings/tenants/${tenant._humanReadableId}/admins`),
                          iconClass: 'fas fa-user-shield',
                          tooltip: t('Admins', this.props.currentLanguage),
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
}

const mapStateToProps = state => ({
  ...state.context,
});

export const TenantList = connect(mapStateToProps)(TenantListComponent);
