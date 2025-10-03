import sortBy from 'lodash/sortBy';
import values from 'lodash/values';
import { useContext, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Select from 'react-select';
import { toast } from 'sonner';

import { I18nContext, ModalContext, useDaikokuBackOffice, useTenantBackOffice } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import { ITeamSimple, ITenantFull, IUser, isError } from '../../../types';
import {
  AvatarWithAction,
  Can,
  Option,
  PaginatedComponent,
  tenant as TENANT,
  getInitials,
  manage,
  userHasAvatar,
} from '../../utils';

const AdminList = () => {
  const context = useContext(GlobalContext);

  const [search, setSearch] = useState('');
  const [addableAdmins, setAddableAdmins] = useState<Array<IUser>>([]);
  const [admins, setAdmins] = useState<Array<IUser>>([]);
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<ITeamSimple>();
  const [tenant, setTenant] = useState<ITenantFull>();
  const [filteredAdmins, setFilteredAdmins] = useState<Array<IUser>>([]);
  const [selectedAdmin, setSelectedAdmin] = useState<IUser>();

  const { translate, Translation } = useContext(I18nContext);
  const { alert, confirm } = useContext(ModalContext);
  const params = useParams();

  useEffect(() => {
    const tenantId = params.tenantId || context.tenant._id;
    Promise.all([
      Services.tenantAdmins(tenantId),
      Services.addableAdminsForTenant(tenantId),
      Services.oneTenant(tenantId),
    ]).then(([maybeAdministration, addableAdmins, tenant]) => {
      if (!isError(maybeAdministration)) {
        setAdmins(maybeAdministration.admins);
        setTeam(maybeAdministration.team);
      }
      if (!isError(tenant)){
        setTenant(tenant);
      } 
      setAddableAdmins(addableAdmins);
      setLoading(false);
    });
  }, [params.tenantId]);

  useEffect(() => {
    const filteredAdmins = Option(search)
      .map((search) => admins.filter(({ name, email }) => [name, email].some((value) => value.toLowerCase().includes(search))))
      .getOrElse(admins);

    setFilteredAdmins(filteredAdmins);
  }, [search, admins]);

  useEffect(() => {
    if (selectedAdmin) {
      Services.addAdminsToTenant(tenant?._id, [selectedAdmin._id]).then((team) => {
        if (team.error) {
          toast.error(team.error);
        }
        else {
          setTeam(team);
          setAdmins([...admins, selectedAdmin]);
          setAddableAdmins(addableAdmins.filter((u) => u._id !== selectedAdmin._id));
          toast.success(translate({ key: 'admin.added.successfully', replacements: [selectedAdmin.name] }));
          setSelectedAdmin(undefined);
        }
      });
    }
  }, [selectedAdmin]);

  const adminToSelector = (admin: IUser) => ({
    label: (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {admin.name} ({admin.email}){' '}
        {userHasAvatar(admin) && <img
          style={{ borderRadius: '50%', backgroundColor: 'white', width: 34, height: 34 }}
          src={admin.picture}
          alt="avatar"
        />}
        {!userHasAvatar(admin) && <div
          className='avatar-without-img'
          style={{ borderRadius: '50%', backgroundColor: 'white', width: 34, height: 34 }}
        >{getInitials(admin.name)}</div>}
      </div>
    ),

    value: admin
  });

  const removeAdmin = (admin: IUser) => {
    if (team?.users.length === 1) {
      alert({ message: translate('remove.admin.tenant.alert') });
    } else {
      (confirm({ message: translate('remove.admin.tenant.confirm') }))
        .then((ok) => {
          if (ok) {
            Services.removeAdminFromTenant(tenant?._id, admin._id).then((team) => {
              if (team.error) {
                toast.error(team.error);
              }
              else {
                setTeam(team);
                setAddableAdmins([...addableAdmins, admin]);
                setAdmins(admins.filter((a) => a._id !== admin._id));
                toast.success(translate({ key: 'remove.admin.tenant.success', replacements: [admin.name] }));
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
            className="add-member-select me-2 reactSelect"//@ts-ignore
            options={addableAdmins.map(adminToSelector)}//@ts-ignore
            onChange={(slug) => setSelectedAdmin(slug!.value)}
            value={selectedAdmin}
            filterOption={(data, search) => values(data.value)
              .filter((e) => typeof e === 'string')
              .some((v) => v.includes(search))}
            classNamePrefix="reactSelect" />
          <input placeholder={translate('Find an admin')} className="form-control" onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <PaginatedComponent items={sortBy(filteredAdmins, [(a) => a.name.toLowerCase()])} count={15} formatter={(admin) => {
        return (<AvatarWithAction key={admin._id} avatar={admin.picture} name={admin.name} infos={<span className="team-member__name">{admin.name}</span>} actions={[
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
