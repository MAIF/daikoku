import { constraints, Form, format, type } from '@maif/react-forms';
import sortBy from 'lodash/sortBy';
import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { I18nContext, ModalContext, useApiBackOffice } from '../../../contexts';
import * as Services from '../../../services';
import { IApi, isError, ITeamSimple } from '../../../types';
import { FeedbackButton } from '../../utils/FeedbackButton';
import { Spinner } from '../../utils/Spinner';
import { nextTick } from 'node:process';

type TeamApiSettingsProps = {
  api: IApi,
  currentTeam: ITeamSimple,
  versions: Array<string>
}
export const TeamApiSettings = ({ api, currentTeam, versions }: TeamApiSettingsProps) => {

  const { translate } = useContext(I18nContext);
  const { confirm, openFormModal } = useContext(ModalContext);
  const navigate = useNavigate();

  const transferOwnership = ({ team }: { team: ITeamSimple }) => {

    Services.transferApiOwnership(team, api.team, api._id).then((r) => {
      if (r.notify) {
        toast.info(translate('team.transfer.notified'));
      } else if (r.error) {
        toast.error(r.error);
      } else {
        toast.error(translate('issues.on_error'));
      }
    });
  };

  const transferSchema = {
    team: {
      type: type.string,
      label: translate('new.owner'),
      format: format.select,
      optionsFrom: Services.teams(currentTeam)
        .then((teams) => {
          if (!isError(teams)) {
            return sortBy(teams.filter((team) => team._id !== api.team), 'name')
          } else {
            return []
          }
        }
        ),
      transformer: (team: ITeamSimple) => ({
        label: team.name,
        value: team._id
      }),
      constraints: [constraints.required(translate('constraints.required.team'))],
    },
    comfirm: {
      type: type.string,
      label: translate({ key: 'type.api.name.confirmation', replacements: [api.name] }),
      constraints: [
        constraints.oneOf(
          [api.name],
          translate({ key: 'constraints.type.api.name', replacements: [api.name] })
        ),
      ],
    },
  };

  const deleteApi = () => {
    const confirm = {
      confirm: {
        type: type.string,
        label: translate({ key: 'delete.item.confirm.modal.confirm.label', replacements: [api.name] }),
        constraints: [
          constraints.oneOf(
            [api.name],
            translate({ key: 'constraints.type.api.name', replacements: [api.name] })
          ),
        ],
      },
    }

    const next = {
      next: {
        type: type.string,
        label: translate("delete.api.confirm.modal.description.next.label"),
        help: translate('delete.api.confirm.modal.description.next.help'),
        format: format.select,
        options: versions.filter(v => v !== api.currentVersion),
        constraints: [
          constraints.required(translate("constraints.required.value"))
        ]
      }
    }

    const schema = versions.length > 2 && api.isDefault ? { ...confirm, ...next } : { ...confirm }
    const automaticNextCurrentVersion = versions.length === 2 ? versions.filter(v => v !== api.currentVersion)[0] : undefined

    openFormModal({
      title: translate('Confirm'),
      description: <div className="alert alert-danger" role="alert">
        <h4 className="alert-heading">{translate('Warning')}</h4>
        <p>{translate("delete.api.confirm.modal.description.1")}</p>
        <ul>
          <li>{translate("delete.api.confirm.modal.description.2")}</li>
        </ul>
        {automaticNextCurrentVersion && <strong>{translate({ key: 'delete.api.confirm.modal.description.next.version', replacements: [automaticNextCurrentVersion]})}</strong>}
      </div>,
      schema: schema,
      onSubmit: ({ next }) => {
        Services.deleteTeamApi(currentTeam._id, api._id, next)
          .then((r) => {
            if (isError(r)) {
              toast.error(r.error)
            } else {
              navigate(`/${currentTeam._humanReadableId}/settings/apis`)
              toast.success(translate('deletion successful'))
            }
          })
      },
      actionLabel: translate('Confirm')
    })
  };

  return (
    <div>
      <div
        className="action mb-3"
        style={{ border: '1px solid tomato', borderRadius: '4px', padding: '5px' }}
      >
        <h3>{translate('transfer.api.ownership.title')}</h3>
        <i>{translate('transfer.api.ownership.description')}</i>
        <Form
          schema={transferSchema}
          onSubmit={transferOwnership}
          options={{ actions: { submit: { label: translate('Transfer') } } }}
        />
      </div>
      <div
        className="action d-flex flex-row align-items-center"
        style={{ border: '1px solid tomato', borderRadius: '4px', padding: '5px' }}
      >
        <div>
          <h3>{translate('delete.api.title')}</h3>
          <i>{translate('delete.api.description')}</i>
        </div>
        <div className="flex-grow-1 text-end" style={{ paddingRight: '15px' }}>
          <button
            type="button"
            className='btn btn-outline-danger me-2'
            onClick={deleteApi}>
            {translate('Delete')}
          </button>
        </div>
      </div>
    </div>
  );
};
