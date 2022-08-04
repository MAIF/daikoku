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
import { useDaikokuBackOffice, useTenantBackOffice } from '../../../contexts';

const AdminList = () => {
  const context = useSelector((s) => (s as any).context);

  const [search, setSearch] = useState('');
  const [addableAdmins, setAddableAdmins] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState(undefined);
  const [tenant, setTenant] = useState(undefined);
  const [filteredAdmins, setFilteredAdmins] = useState([]);
  const [selectedAdmin, setSelectedAdmin] = useState(undefined);

    const { translateMethod, Translation } = useContext(I18nContext);
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
            Services.addAdminsToTenant(tenant._id, [(selectedAdmin as any)._id]).then((team) => {
    if (team.error) {
        toastr.error('Failure', team.error);
    }
    else {
        setTeam(team);
        setAdmins([...admins, selectedAdmin]);
                setAddableAdmins(addableAdmins.filter((u) => u._id !== selectedAdmin._id));
                toastr.success(translateMethod('admin.added.successfully', false, `${selectedAdmin.name} has been added as new admin of the tenant`, selectedAdmin.name));
                setSelectedAdmin(null);
    }
});
          setAddableAdmins(addableAdmins.filter((u) => (u as any)._id !== (selectedAdmin as any)._id));
          toastr.success(translateMethod('admin.added.successfully', false, `${(selectedAdmin as any).name} has been added as new admin of the tenant`, (selectedAdmin as any).name));
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

  const removeAdmin = (admin: any) => {
        if (team.users.length === 1) {
      alert(
                translateMethod(
          'remove.admin.tenant.alert',
          false,
          "You can't delete this admin, it must remain an admin in a tenant."
        )
      );
    } else {
      (window
        .confirm(translateMethod('remove.admin.tenant.confirm', false, 'Are you sure you want to remove this admin from the tenant ?')) as any).then((ok: any) => {
    if (ok) {
                Services.removeAdminFromTenant(tenant._id, admin._id).then((team) => {
            if (team.error) {
                                toastr.error(translateMethod('Failure'), team.error);
            }
            else {
                                setTeam(team);
                                setAddableAdmins([...addableAdmins, admin]);
                                setAdmins(admins.filter((a) => a._id !== admin._id));
                                toastr.success(translateMethod('remove.admin.tenant.success', false, 'Admin deleted successfully', admin.name));
            }
        });
    }
});
                                setAdmins(admins.filter((a) => (a as any)._id !== admin._id));
                toastr.success(
                                    translateMethod(
                    'remove.admin.tenant.success',
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

  return (<Can I={manage} a={TENANT} dispatchError={true} whichOne={tenant}>
      <div className="row">
        <div className="col">
          <h1>
            {tenant && <>{(tenant as any).name} - </>}
            <Translation i18nkey="Admins">Admins</Translation>
          </h1>
        </div>
      </div>
      <div className="row">
        <div className="col-12 mb-3 d-flex justify-content-start">
          <Select placeholder={translateMethod('Add new admin')} className="add-member-select me-2 reactSelect" options={addableAdmins.map(adminToSelector)} onChange={(slug) => setSelectedAdmin(slug.value)} value={selectedAdmin} filterOption={(data, search) => values(data.value)
        .filter((e) => typeof e === 'string')
        .some((v) => v.includes(search))} classNamePrefix="reactSelect"/>
          <input placeholder={translateMethod('Find an admin')} className="form-control" onChange={(e) => setSearch(e.target.value)}/>
        </div>
      </div>
      <PaginatedComponent items={sortBy(filteredAdmins, [(a) => (a as any).name.toLowerCase()])} count={15} formatter={(admin) => {
        return (<AvatarWithAction key={admin._id} avatar={admin.picture} infos={<span className="team-member__name">{admin.name}</span>} actions={[
                {
                    action: () => removeAdmin(admin),
                    iconClass: 'fas fa-trash delete-icon',
                    tooltip: translateMethod('Remove admin rights'),
                },
            ]}/>);
    }}/>
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
