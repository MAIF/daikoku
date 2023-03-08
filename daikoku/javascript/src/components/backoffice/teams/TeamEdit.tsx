import { constraints, Form, format, type } from '@maif/react-forms';
import md5 from 'js-md5';
import {useContext, useEffect, useState} from 'react';
import { toastr } from 'react-redux-toastr';
import {useLocation, useNavigate} from 'react-router-dom';

import { useDispatch, useSelector } from 'react-redux';
import { ModalContext, useTeamBackOffice } from '../../../contexts';
import { AssetChooserByModal, MimeTypeFilter } from '../../../contexts/modals/AssetsChooserModal';
import { I18nContext, TranslateParams, updateTeam } from '../../../core';
import * as Services from '../../../services';
import { isError, IState, ITeamSimple } from '../../../types';


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
          <button type="button" className="btn btn-outline-primary me-1" onClick={setGravatarLink} disabled={!rawValues.contact}>
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

export const teamSchema = (team: ITeamSimple, translate: (props: string | TranslateParams) => string) => ({
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
  const { confirm } = useContext(ModalContext);

  if (!team) {
    return null;
  }

  useEffect(() => {
    document.title = `${team.name} - ${translate('Edition')}`;
  }, []);

  const confirmDelete = () => {
    confirm({
      message: translate('delete team'),
      title: 'Delete team',
    }).then((ok) => {
      if (ok) {
        Services.deleteTeam(team._id)
          .then((r) => {
            if (isError(r)) {
              toastr.success(translate("Error"), r.error)
            } else {
              navigate("/apis")
              toastr.success(translate("Success"), translate({ key: 'team.deleted.success', replacements: [team.name] }))
            }
          })
      }
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
  const currentTeam = useSelector<IState, ITeamSimple>(s => s.context.currentTeam)
  const [contact, setContact] = useState(currentTeam.contact)
  const [alreadyClicked, setAlreadyClicked] = useState(false)
  const dispatch = useDispatch();

  useTeamBackOffice(currentTeam);

  const { search } = useLocation();
  const { translate } = useContext(I18nContext);

  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("teamVerified") === "true") {
      toastr.success(translate('Success'), translate('team.validated.success'))
    } else if (params.get("error") === "2") {
      toastr.error(translate('Error'), translate('team.email.alreadyVerified'))
    } else if (params.get("error") === "3") {
      toastr.error(translate('Error'), translate('token.missing'))
    } else if (params.get("error") === "4") {
      toastr.error(translate('Error'), translate('token.notFound'))
    } else if (params.get("error") === "5") {
      toastr.error(translate('Error'), translate('token.expired'))
    }
  }, []);
  const save = (data: ITeamSimple, contact: string) => {
    Services.updateTeam(data)
      .then((updatedTeam: ITeamSimple) => {
        if (data._humanReadableId !== updatedTeam._humanReadableId) {
          navigate(`/${updatedTeam._humanReadableId}/settings/edition`);
        }
        if(contact !== updatedTeam.contact) {
          setContact(updatedTeam.contact)
          toastr.info(
            translate("mailValidation.sent.title"),
            translate("mailValidation.sent.body")
          )
          setAlreadyClicked(false)
        }
        dispatch(updateTeam(updatedTeam))
        toastr.success(
          translate('Success'),
          translate({ key: 'team.updated.success', replacements: [updatedTeam.name] })
        );
      });
  };

  return (
    <div>
      {!currentTeam.verified && !alreadyClicked &&
      <div className="alert alert-danger" role="alert">
        {translate('team.email.notVerified.info')} <a href="#" onClick={() => {
        Services.sendEmailVerification(currentTeam._id)
          .then((r) => {
            if (isError(r)) {
              toastr.success(translate("Error"), r.error)
            } else {
              setAlreadyClicked(true)
              toastr.success(
                translate("Success"),
                translate({ key: 'team.email.verification.send', replacements: [currentTeam.contact] }))
            }
          })}} className="alert-link">{translate('here')}</a>.
      </div> }
      {!currentTeam.verified && alreadyClicked &&
          <div className="alert alert-success" role="alert">
            {translate('mail.sent')}
          </div> }
      <TeamEditForm team={currentTeam} updateTeam={(team) => save(team, contact)} />
    </div>
  );
};
