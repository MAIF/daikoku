import React, { Component } from 'react';
import { connect } from 'react-redux';
import Select from 'react-select';
import { toastr } from 'react-redux-toastr';

import * as Services from '../../../services';
import { UserBackOffice } from '../../backoffice';
import { Can, manage, tenant, PaginatedComponent, AvatarWithAction } from '../../utils';
import { Translation, t } from '../../../locales';

class TenantAdminListComponent extends Component {
  state = {
    search: undefined,
    addableAdmins: [],
    admins: [],
    loading: true
  }

  componentDidMount() {
    Promise.all([
      Services.tenantAdmins(this.props.tenant._id),
      Services.addableAdminsForTenant(this.props.tenant._id),
      Services.oneTenant(this.props.tenant._id)
    ])
      .then(
        ([{ team, admins }, addableAdmins, tenant]) => {
          this.setState({
            team,
            tenant,
            addableAdmins,
            admins,
            loading: false,
          });
        }
      );
  }

  adminToSelector(admin) {
    return ({
      label: (
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {admin.name} ({admin.email}){' '}
          <img
            style={{ borderRadius: '50%', backgroundColor: 'white', width: 34, height: 34 }}
            src={admin.picture}
            alt="avatar"
          />
        </div>
      ),
      value: admin,
    })
  }

  removeAdmin = admin => {
    if (
      this.state.team.users.length === 1
    ) {
      alert(
        t(
          'remove.admin.tenant.alert',
          this.props.currentLanguage,
          false,
          "You can't delete this admin, it must remain an admin in a tenant."
        )
      );
    } else {
      window.confirm(
        t(
          'remove.admin.tenant.confirm',
          this.props.currentLanguage,
          false,
          'Are you sure you want to remove this admin from the tenant ?'
        )
      )
        .then(ok => {
          if (ok) {
            Services.removeAdminFromTenant(this.state.tenant._id, admin._id)
              .then(team => {
                console.debug({ team })
                if (team.error) {
                  toastr.error(t("Failure", this.props.currentLanguage), team.error)
                } else {
                  this.setState({
                    team,
                    addableAdmins: [...this.state.addableAdmins, admin],
                    admins: this.state.admins.filter(a => a._id !== admin._id)
                  }, () => {
                    toastr.success(t('remove.admin.tenant.success', this.props.currentLanguage, false, 'Admin deleted successfully', admin.name))
                  })
                }
              })
          }
        });
    }
  };

  addAdmin = slug => {
    const admin = slug.value;
    this.setState({ selectedAdmin: admin }, () => {
      Services.addAdminsToTenant(this.state.tenant._id, [admin._id])
        .then(team => {
          if (team.error) {
            toastr.error('Failure', team.error)
          } else {
            this.setState({
              selectedAdmin: null,
              team,
              admins: [...this.state.admins, admin],
              addableAdmins: this.state.addableAdmins.filter(u => u._id !== admin._id)
            }, () => {
              toastr.success(t(
                'admin.added.successfully',
                this.props.currentLanguage,
                false,
                `${admin.name} has been added as new admin of the tenant`,
                admin.name
              ))
            })
          }
        }
        );
    })
  };

  render() {
    const filteredAdmins = this.state.search
      ? this.state.admins.filter(({ name, email }) =>
        [name, email].some(value => value.toLowerCase().includes(this.state.search))
      )
      : this.state.admins;

    return (
      <UserBackOffice tab="Admins" isLoading={this.state.loading}>
        <Can I={manage} a={tenant} dispatchError={true}>
          <div className="row">
            <div className="col">
              <h1>
                <Translation
                  i18nkey="Admins"
                  language={this.props.currentLanguage}>
                  Admins
              </Translation>
              </h1>
            </div>
          </div>
          <div className="row">
            <div className="col-12 mb-3 d-flex justify-content-start">
              <Select
                placeholder={t('Add new admin', this.props.currentLanguage)}
                className="add-member-select mr-2 reactSelect"
                options={this.state.addableAdmins.map(this.adminToSelector)}
                onChange={this.addAdmin}
                value={this.state.selectedAdmin}
                filterOption={(data, search) => _.values(data.value).some(v => v.includes(search))}
                classNamePrefix="reactSelect"
              />
              <input
                placeholder={t('Find an admin', this.props.currentLanguage)}
                className="form-control"
                onChange={e => {
                  this.setState({ search: e.target.value });
                }}
              />
            </div>
          </div>
          <PaginatedComponent
            currentLanguage={this.props.currentLanguage}
            items={_.sortBy(filteredAdmins, [a => a.name.toLowerCase()])}
            count={15}
            formatter={(admin) => {
              return (
                <AvatarWithAction
                  key={admin._id}
                  avatar={admin.picture}
                  infos={
                    <span className="team-member__name">{admin.name}</span>
                  }
                  actions={[
                    {
                      action: () => this.removeAdmin(admin),
                      iconClass: 'fas fa-trash delete-icon',
                      tooltip: t('Remove admin rights', this.props.currentLanguage),
                    },
                  ]}
                />
              );
            }}
          />
        </Can>
      </UserBackOffice>
    );
  }
}

const mapStateToProps = state => ({
  ...state.context,
});

export const TenantAdminList = connect(mapStateToProps)(TenantAdminListComponent);
