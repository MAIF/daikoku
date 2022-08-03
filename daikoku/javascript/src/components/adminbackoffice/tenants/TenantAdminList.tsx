import React, { useState, useEffect, useContext } from 'react';
import { useSelector } from 'react-redux';
import Select from 'react-select';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
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

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
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
      // @ts-expect-error TS(2532): Object is possibly 'undefined'.
      Services.addAdminsToTenant(tenant._id, [(selectedAdmin as any)._id]).then((team) => {
    if (team.error) {
        toastr.error('Failure', team.error);
    }
    else {
        setTeam(team);
        setAdmins([...admins, selectedAdmin]);
        // @ts-expect-error TS(2339): Property '_id' does not exist on type 'never'.
        setAddableAdmins(addableAdmins.filter((u) => u._id !== selectedAdmin._id));
        // @ts-expect-error TS(2339): Property 'name' does not exist on type 'never'.
        toastr.success(translateMethod('admin.added.successfully', false, `${selectedAdmin.name} has been added as new admin of the tenant`, selectedAdmin.name));
        // @ts-expect-error TS(2345): Argument of type 'null' is not assignable to param... Remove this comment to see the full error message
        setSelectedAdmin(null);
    }
});
          setAddableAdmins(addableAdmins.filter((u) => (u as any)._id !== (selectedAdmin as any)._id));
          toastr.success(translateMethod('admin.added.successfully', false, `${(selectedAdmin as any).name} has been added as new admin of the tenant`, (selectedAdmin as any).name));
          // @ts-expect-error TS(2345): Argument of type 'null' is not assignable to param... Remove this comment to see the full error message
          setSelectedAdmin(null);
        }
      });
    }
  // @ts-expect-error TS(2304): Cannot find name 'selectedAdmin'.
  }, [selectedAdmin]);

  const adminToSelector = (admin: any) => ({
    label: (
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {admin.name} ({admin.email}){' '}
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
    // @ts-expect-error TS(2304): Cannot find name 'team'.
    if (team.users.length === 1) {
      alert(
        // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
        translateMethod(
          'remove.admin.tenant.alert',
          false,
          "You can't delete this admin, it must remain an admin in a tenant."
        )
      );
    } else {
      (window
    // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
    .confirm(translateMethod('remove.admin.tenant.confirm', false, 'Are you sure you want to remove this admin from the tenant ?')) as any).then((ok: any) => {
    if (ok) {
        // @ts-expect-error TS(2552): Cannot find name 'tenant'. Did you mean 'TENANT'?
        Services.removeAdminFromTenant(tenant._id, admin._id).then((team) => {
            if (team.error) {
                // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
                toastr.error(translateMethod('Failure'), team.error);
            }
            else {
                // @ts-expect-error TS(2304): Cannot find name 'setTeam'.
                setTeam(team);
                // @ts-expect-error TS(2304): Cannot find name 'setAddableAdmins'.
                setAddableAdmins([...addableAdmins, admin]);
                // @ts-expect-error TS(2304): Cannot find name 'setAdmins'.
                setAdmins(admins.filter((a) => a._id !== admin._id));
                // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
                toastr.success(translateMethod('remove.admin.tenant.success', false, 'Admin deleted successfully', admin.name));
            }
        });
    }
});
                // @ts-expect-error TS(2304): Cannot find name 'setAdmins'.
                setAdmins(admins.filter((a) => (a as any)._id !== admin._id));
                toastr.success(
                  // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
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
  // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
  useTenantBackOffice();
  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return <AdminList />;
};
export const DaikokuTenantAdminList = () => {
  useDaikokuBackOffice();
  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return <AdminList />;
};
