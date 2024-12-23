import { constraints, Form, format, Schema, type } from '@maif/react-forms';
import { md5 } from 'js-md5';
import { useContext, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { I18nContext, ModalContext, TranslateParams, useTeamBackOffice } from '../../../contexts';
import { AssetChooserByModal, MimeTypeFilter } from '../../../contexts/modals/AssetsChooserModal';
import * as Services from '../../../services';
import { isError, ITeamSimple } from '../../../types';
import { Spinner } from '../../utils';


type AvatarProps = {
  rawValues: ITeamSimple
  value: string
  getValue: (x: string) => any
  onChange: (x: string) => void
  team: ITeamSimple
}
const Avatar = ({
  rawValues,
  value,
  getValue,
  onChange,
  team,
}: AvatarProps) => {
  const { Translation, translate } = useContext(I18nContext);

  const setGravatarLink = () => {
    const email = getValue('contact').toLowerCase().trim();
    const url = `https://www.gravatar.com/avatar/${md5(email)}?size=128&d=robohash`;
    onChange(url);
  };


  return (
    <div className="d-flex flex-row align-items-center">
      <div className="float-right mb-4 position-relative">
        <img
          src={`${rawValues?.avatar}${rawValues?.avatar?.startsWith('http') ? '' : `?${Date.now()}`
            }`}
          style={{
            width: 100,
            borderRadius: '50%',
            backgroundColor: 'white',
          }}
          alt="avatar"
          className="mx-3"
        />
      </div>
      <div className="d-flex flex-column flex-grow-1">
        <input
          type="text"
          className="form-control mb-1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className='d-flex justify-content-end'>
          <button type="button" className="btn btn-outline-info me-1" onClick={setGravatarLink} disabled={!rawValues.contact}>
            <i className="fas fa-user-circle me-1" />
            <Translation i18nkey="Set avatar from Gravatar">Set avatar from Gravatar</Translation>
          </button>
          <AssetChooserByModal
            typeFilter={MimeTypeFilter.image}
            onlyPreview
            tenantMode={false}
            team={team}
            label={translate('Set avatar from asset')}
            onSelect={(asset) => onChange(asset.link)}
          />
        </div>
      </div>
    </div>
  );
};

export const teamSchema = (team: ITeamSimple, translate: (props: string | TranslateParams) => string): Schema => ({
  name: {
    type: type.string,
    label: translate('Name'),
    disabled: team.type === 'Personal' || team.type === 'Admin',
    constraints: [
      constraints.required(translate('constraints.required.name'))
    ]
  },

  description: {
    type: type.string,
    label: translate('Description'),
    disabled: team.type === 'Personal' || team.type === 'Admin',
  },

  contact: {
    type: type.string,
    label: translate('Team contact'),
    disabled: team.type === 'Personal' || team.type === 'Admin',
  },

  avatar: {
    type: type.string,
    label: translate('Team avatar'),
    render: (v: any) => Avatar({ ...v, team: team }),
    disabled: team.type === 'Personal' || team.type === 'Admin',
  },

  apiKeyVisibility: {
    type: type.string,
    format: format.buttonsSelect,
    label: translate('apikeys visibility'),
    disabled: team.type === 'Personal' || team.type === 'Admin',
    defaultValue: 'User',
    options: [
      { label: translate('Administrator'), value: 'Administrator' },
      { label: translate('ApiEditor'), value: 'ApiEditor' },
      { label: translate('User'), value: 'User' },
    ],
  }
});

type TeamEditFormProps = {
  team: ITeamSimple
  updateTeam: (t: ITeamSimple) => void


}
export const TeamEditForm = ({
  team,
  updateTeam,


}: TeamEditFormProps) => {
  const navigate = useNavigate();

  const { translate } = useContext(I18nContext);
  const { confirm, openFormModal } = useContext(ModalContext);

  if (!team) {
    return null;
  }

  useEffect(() => {
    document.title = `${team.name} - ${translate('Edition')}`;
  }, []);

  const confirmDelete = () => {
    openFormModal({
      title: translate('Confirm'),
      description: <div className="alert alert-danger" role="alert">
        <h4 className="alert-heading">{translate('Warning')}</h4>
        <p>{translate("delete.team.confirm.modal.description.1")}</p>
        <ul>
          <li>{translate("delete.team.confirm.modal.description.2")}</li>
          <li>{translate("delete.team.confirm.modal.description.3")}</li>
          <li>{translate("delete.team.confirm.modal.description.4")}</li>
        </ul>
      </div>,
      schema: {
        confirm: {
          type: type.string,
          label: translate({ key: 'delete.item.confirm.modal.confirm.label', replacements: [team.name] }),
          constraints: [
            constraints.oneOf(
              [team.name],
              translate({ key: 'constraints.type.api.name', replacements: [team.name] })
            ),
          ],
        },
      },
      onSubmit: () => Services.deleteTeam(team._id)
        .then((r) => {
          if (isError(r)) {
            toast.error(r.error)
          } else {
            navigate("/apis")
            toast.success(translate({ key: 'team.deleted.success', replacements: [team.name] }))
          }
        }),
      actionLabel: translate('Confirm')
    })
  }

  return (
    <Form
      schema={teamSchema(team, translate)}
      value={team}
      onSubmit={(team) => updateTeam(team)}
      footer={({ valid }) => {
        return (
          <div className='d-flex flex-row align-items-center justify-content-end mt-3'>
            <button type="button" className='btn btn-outline-danger me-2' onClick={confirmDelete}>{translate('Delete')}</button>
            <button type="button" className='btn btn-outline-success' onClick={valid}>{translate('Save')}</button>
          </div>
        )
      }}
      options={{
        actions: { submit: { label: translate('Save') } }
      }}
    />
  );
};

export const TeamEdit = () => {
  const navigate = useNavigate();
  const { isLoading, currentTeam, reloadCurrentTeam, error } = useTeamBackOffice()

  const [alreadyClicked, setAlreadyClicked] = useState(false)

  const { search } = useLocation();
  const { translate } = useContext(I18nContext);

  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("teamVerified") === "true") {
      toast.success(translate('team.validated.success'))
    } else if (params.get("error") === "2") {
      toast.error(translate('team.email.alreadyVerified'))
    } else if (params.get("error") === "3") {
      toast.error(translate('token.missing'))
    } else if (params.get("error") === "4") {
      toast.error(translate('token.notFound'))
    } else if (params.get("error") === "5") {
      toast.error(translate('token.expired'))
    }
  }, []);

  const save = (data: ITeamSimple, contact: string) => {
    Services.updateTeam(data)
      .then((updatedTeam: ITeamSimple) => {
        if (data._humanReadableId !== updatedTeam._humanReadableId) {
          navigate(`/${updatedTeam._humanReadableId}/settings/edition`);
        }
        if (contact !== updatedTeam.contact) {
          toast.info(translate("mailValidation.sent.body"))
          setAlreadyClicked(false)
        }
      })
      .then(() => reloadCurrentTeam())
      .then(() => toast.success(translate({ key: 'team.updated.success', replacements: [data.name] })));
  };

  if (isLoading) {
    return <Spinner />
  } else if (currentTeam && !isError(currentTeam)) {
    return (
      <div>
        {!currentTeam.verified && !alreadyClicked &&
          <div className="alert alert-warning" role="alert">
            {translate('team.email.notVerified.info')}
            <button className="btn btn-outline-danger d-flex align-items-end" onClick={() => {
              Services.sendEmailVerification(currentTeam._id)
                .then((r) => {
                  if (isError(r)) {
                    toast.success(r.error)
                  } else {
                    setAlreadyClicked(true)
                    toast.success(translate({ key: 'team.email.verification.send', replacements: [currentTeam.contact] }))
                  }
                })
            }}>{translate('team.email.notVerified')}</button>
          </div>}
        {!currentTeam.verified && alreadyClicked &&
          <div className="alert alert-success" role="alert">
            {translate('mail.sent')}
          </div>}
        <TeamEditForm team={currentTeam} updateTeam={(team) => save(team, currentTeam.contact)} />
      </div>
    )
  } else {
    toast.error(error?.message || currentTeam?.error)
    return <></>
  }


};
