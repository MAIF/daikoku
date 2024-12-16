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

type TeamApiSettingsProps = {
  api: IApi,
  currentTeam: ITeamSimple
}
export const TeamApiSettings = ({ api, currentTeam }: TeamApiSettingsProps) => {

  const { translate } = useContext(I18nContext);
  const { confirm } = useContext(ModalContext);
  const navigate = useNavigate();

  const transferOwnership = ({team}: {team: ITeamSimple}) => {

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
    return confirm({ message: translate('delete.api.confirm') })
      .then((ok) => {
        if (ok) {
          Services.deleteTeamApi(currentTeam._id, api._id)
            .then(() => navigate(`/${currentTeam._humanReadableId}/settings/apis`))
            .then(() => toast.success(translate('deletion successful')));
        }
      });
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
            <FeedbackButton
              type="danger"
              onPress={() => deleteApi()}
              feedbackTimeout={1000}
              disabled={false}
            >{translate('Delete this Api')}</FeedbackButton>
          </div>
        </div>
      </div>
    );
};
