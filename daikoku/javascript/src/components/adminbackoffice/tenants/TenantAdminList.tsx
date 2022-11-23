import React, { useState, useEffect, useContext } from 'react';
import { useSelector } from 'react-redux';
import Select from 'react-select';
import { toastr } from 'react-redux-toastr';
import values from 'lodash/values';
import sortBy from 'lodash/sortBy';
import { useParams } from 'react-router-dom';

import * as Services from '../../../services';
import {
  Can,
  manage,
  tenant as TENANT,
  PaginatedComponent,
  AvatarWithAction,
  Option,
} from '../../utils';
import { I18nContext } from '../../../core';
import { ModalContext, useDaikokuBackOffice, useTenantBackOffice } from '../../../contexts';
import { IState, IStateContext, ITeamSimple, ITenantFull, IUserSimple } from '../../../types';

const AdminList = () => {
  const context = useSelector<IState, IStateContext>((s) => s.context);

  const [search, setSearch] = useState('');
  const [addableAdmins, setAddableAdmins] = useState<Array<any>>([]);
  const [admins, setAdmins] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<ITeamSimple>();
  const [tenant, setTenant] = useState<ITenantFull>();
  const [filteredAdmins, setFilteredAdmins] = useState([]);
  const [selectedAdmin, setSelectedAdmin] = useState<any>(undefined);

  const { translate, Translation } = useContext(I18nContext);
  const { alert, confirm } = useContext(ModalContext);
  const params = useParams();

  useEffect(() => {
    const tenantId = params.tenantId || context.tenant._id;
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
  }, [params.tenantId]);

  useEffect(() => {
    const filteredAdmins = Option(search)
      .map((search: any) => admins.filter(({ name, email }) => [name, email].some((value) => (value as any).toLowerCase().includes(search))))
      .getOrElse(admins);

    setFilteredAdmins(filteredAdmins);
  }, [search, admins]);

  useEffect(() => {
    if (selectedAdmin) {
      Services.addAdminsToTenant(tenant?._id, [(selectedAdmin as any)._id]).then((team) => {
        if (team.error) {
          toastr.error('Failure', team.error);
        }
        else {
          setTeam(team);
          setAdmins([...admins, selectedAdmin]);
          setAddableAdmins(addableAdmins.filter((u: any) => u._id !== selectedAdmin._id));
          toastr.success(translate('Success'), translate({ key: 'admin.added.successfully', replacements: [selectedAdmin.name] }));
          setSelectedAdmin(null);
        }
      });
    }
  }, [selectedAdmin]);

  const adminToSelector = (admin: any) => ({
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

    value: admin
  });

  const removeAdmin = (admin: IUserSimple) => {
    if (team?.users.length === 1) {
      alert({ message: translate('remove.admin.tenant.alert') });
    } else {
      (confirm({ message: translate('remove.admin.tenant.confirm') }))
        .then((ok) => {
          if (ok) {
            Services.removeAdminFromTenant(tenant?._id, admin._id).then((team) => {
              if (team.error) {
                toastr.error(translate('Failure'), team.error);
              }
              else {
                setTeam(team);
                setAddableAdmins([...addableAdmins, admin]);
                setAdmins(admins.filter((a) => a._id !== admin._id));
                toastr.success(translate('Success'), translate({ key: 'remove.admin.tenant.success', replacements: [admin.name] }));
              }
            });
          }
        });
    }
  }

  return (
    <Can I={manage} a={TENANT} dispatchError={true} whichOne={tenant}>
      <h1>
        {tenant && <>{tenant.name} - </>}
        <Translation i18nkey="Admins">Admins</Translation>
      </h1>
      <div className="row">
        <div className="col-12 mb-3 d-flex justify-content-start">
          <Select
            placeholder={translate('Add new admin')}
            className="add-member-select me-2 reactSelect"
            options={addableAdmins.map(adminToSelector)}
            onChange={(slug) => setSelectedAdmin(slug.value)}
            value={selectedAdmin}
            filterOption={(data, search) => values(data.value)
              .filter((e) => typeof e === 'string')
              .some((v) => v.includes(search))}
            classNamePrefix="reactSelect" />
          <input placeholder={translate('Find an admin')} className="form-control" onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <PaginatedComponent items={sortBy(filteredAdmins, [(a) => (a as any).name.toLowerCase()])} count={15} formatter={(admin) => {
        return (<AvatarWithAction key={admin._id} avatar={admin.picture} infos={<span className="team-member__name">{admin.name}</span>} actions={[
          {
            action: () => removeAdmin(admin),
            iconClass: 'fas fa-trash delete-icon',
            tooltip: translate('Remove admin rights'),
          },
        ]} />);
      }} />
    </Can>);
};

export const TenantAdminList = () => {
  useTenantBackOffice();
  return <AdminList />;
};
export const DaikokuTenantAdminList = () => {
  useDaikokuBackOffice();
  return <AdminList />;
};
