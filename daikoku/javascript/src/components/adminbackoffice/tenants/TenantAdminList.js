import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import Select from 'react-select';
import { toastr } from 'react-redux-toastr';
import _ from 'lodash';

import * as Services from '../../../services';
import { UserBackOffice } from '../../backoffice';
import {
  Can,
  manage,
  tenant as TENANT,
  PaginatedComponent,
  AvatarWithAction,
  Option,
} from '../../utils';
import { Translation, t } from '../../../locales';

const TenantAdminListComponent = (props) => {
  const [search, setSearch] = useState('');
  const [addableAdmins, setAddableAdmins] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState(undefined);
  const [tenant, setTenant] = useState(undefined);
  const [filteredAdmins, setFilteredAdmins] = useState([]);
  const [selectedAdmin, setSelectedAdmin] = useState(undefined);

  useEffect(() => {
    const tenantId = props.match.params.tenantId || props.tenant._id;
    Promise.all([
      Services.tenantAdmins(tenantId),
      Services.addableAdminsForTenant(tenantId),
      Services.oneTenant(tenantId),
    ]).then(([{ team, admins }, addableAdmins, tenant]) => {
      setTeam(team);
      setAdmins(admins);
      setTenant(tenant);
      setAddableAdmins(addableAdmins);
      setAdmins(admins);
      setLoading(false);
    });
  }, [props.match.params.tenantId]);

  useEffect(() => {
    const filteredAdmins = Option(search)
      .map((search) =>
        admins.filter(({ name, email }) =>
          [name, email].some((value) => value.toLowerCase().includes(search))
        )
      )
      .getOrElse(admins);

    setFilteredAdmins(filteredAdmins);
  }, [search, admins]);

  useEffect(() => {
    if (selectedAdmin) {
      Services.addAdminsToTenant(tenant._id, [selectedAdmin._id]).then((team) => {
        if (team.error) {
          toastr.error('Failure', team.error);
        } else {
          setTeam(team);
          setAdmins([...admins, selectedAdmin]);
          setAddableAdmins(addableAdmins.filter((u) => u._id !== selectedAdmin._id));
          toastr.success(
            t(
              'admin.added.successfully',
              props.currentLanguage,
              false,
              `${selectedAdmin.name} has been added as new admin of the tenant`,
              selectedAdmin.name
            )
          );
          setSelectedAdmin(null);
        }
      });
    }
  }, [selectedAdmin]);

  const adminToSelector = (admin) => ({
    label: (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {admin.name} ({admin.email}){' '}
        <img
          style={{ borderRadius: '50%', backgroundColor: 'white', width: 34, height: 34 }}
          src={admin.picture}
          alt="avatar"
        />
      </div>
    ),
    value: admin,
  });

  const removeAdmin = (admin) => {
    if (team.users.length === 1) {
      alert(
        t(
          'remove.admin.tenant.alert',
          props.currentLanguage,
          false,
          'You can\'t delete this admin, it must remain an admin in a tenant.'
        )
      );
    } else {
      window
        .confirm(
          t(
            'remove.admin.tenant.confirm',
            props.currentLanguage,
            false,
            'Are you sure you want to remove this admin from the tenant ?'
          )
        )
        .then((ok) => {
          if (ok) {
            Services.removeAdminFromTenant(tenant._id, admin._id).then((team) => {
              if (team.error) {
                toastr.error(t('Failure', props.currentLanguage), team.error);
              } else {
                setTeam(team);
                setAddableAdmins([...addableAdmins, admin]);
                setAdmins(admins.filter((a) => a._id !== admin._id));
                toastr.success(
                  t(
                    'remove.admin.tenant.success',
                    props.currentLanguage,
                    false,
                    'Admin deleted successfully',
                    admin.name
                  )
                );
              }
            });
          }
        });
    }
  };

  return (
    <UserBackOffice tab={props.tenantMode ? 'Admins' : 'Tenants'} isLoading={loading}>
      <Can I={manage} a={TENANT} dispatchError={true} whichOne={tenant}>
        <div className="row">
          <div className="col">
            <h1>
              {tenant && <>{tenant.name} - </>}
              <Translation i18nkey="Admins" language={props.currentLanguage}>
                Admins
              </Translation>
            </h1>
          </div>
        </div>
        <div className="row">
          <div className="col-12 mb-3 d-flex justify-content-start">
            <Select
              placeholder={t('Add new admin', props.currentLanguage)}
              className="add-member-select mr-2 reactSelect"
              options={addableAdmins.map(adminToSelector)}
              onChange={(slug) => setSelectedAdmin(slug.value)}
              value={selectedAdmin}
              filterOption={(data, search) => _.values(data.value).some((v) => v.includes(search))}
              classNamePrefix="reactSelect"
            />
            <input
              placeholder={t('Find an admin', props.currentLanguage)}
              className="form-control"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <PaginatedComponent
          currentLanguage={props.currentLanguage}
          items={_.sortBy(filteredAdmins, [(a) => a.name.toLowerCase()])}
          count={15}
          formatter={(admin) => {
            return (
              <AvatarWithAction
                key={admin._id}
                avatar={admin.picture}
                infos={<span className="team-member__name">{admin.name}</span>}
                actions={[
                  {
                    action: () => removeAdmin(admin),
                    iconClass: 'fas fa-trash delete-icon',
                    tooltip: t('Remove admin rights', props.currentLanguage),
                  },
                ]}
              />
            );
          }}
        />
      </Can>
    </UserBackOffice>
  );
};

const mapStateToProps = (state) => ({
  ...state.context,
});

export const TenantAdminList = connect(mapStateToProps)(TenantAdminListComponent);
