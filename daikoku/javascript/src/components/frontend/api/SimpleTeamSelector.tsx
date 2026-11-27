import classNames from 'classnames';
import { useContext } from 'react';

import { I18nContext } from '../../../contexts';
import { ITeamSimple } from '../../../types';

export const SimpleTeamSelector = ({
  teams,
  showApiKeySelectModal,
}: {
  teams: Array<{ disabledFor: string[]; team: ITeamSimple }>;
  showApiKeySelectModal: (teamId: string) => void;
}) => {
  const { translate } = useContext(I18nContext);

  return (
    <div className="modal-body">
      <div className="modal-description">{translate('team.selection.desc.request')}</div>
      <div className="team-selection__container">
        {teams.map(({ team, disabledFor }) => (
          <div
            key={team._id}
            className={classNames('team-selection team-selection__team', {
              selectable: disabledFor.length === 0,
              'cursor-forbidden': disabledFor.length > 0,
            })}
            role="button"
            tabIndex={disabledFor.length === 0 ? 0 : -1}
            aria-disabled={disabledFor.length > 0}
            onClick={() => {
              if (disabledFor.length === 0) showApiKeySelectModal(team._id);
            }}
            onKeyDown={(event) => {
              if (disabledFor.length === 0 && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                showApiKeySelectModal(team._id);
              }
            }}
          >
            {disabledFor.map((cause, index) => (
              <span key={index} className="btn --small --secondary disabled">
                {cause}
              </span>
            ))}
            <span className="ms-2">{team.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
