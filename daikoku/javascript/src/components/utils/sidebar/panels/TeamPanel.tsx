import { useQuery, useQueryClient } from "@tanstack/react-query";
import classNames from "classnames";
import debounce from 'lodash/debounce';
import { useContext, useState } from "react";
import { Link } from "react-router-dom";
import Plus from 'react-feather/dist/icons/plus';

import { I18nContext, ModalContext } from "../../../../contexts";
import { GlobalContext } from "../../../../contexts/globalContext";
import * as Services from '../../../../services';
import { isError } from "../../../../types";
import { Spinner } from "../../Spinner";
import { toast } from "sonner";
import { teamSchema } from "../../../backoffice/teams/TeamEdit";

const Teams = () => {
  const [search, setSearch] = useState('')

  const { translate } = useContext(I18nContext)
  const { close, openFormModal } = useContext(ModalContext)

  const queryClient = useQueryClient();
  const myTeamsRequest = useQuery({ queryKey: ['myTeams'], queryFn: () => Services.myTeams() })

  const createTeam = () => {
    Services.fetchNewTeam()
      .then((team) => openFormModal({
        title: translate('Create a new team'),
        schema: teamSchema(team, translate),
        onSubmit: (data) => Services.createTeam(data)
          .then(r => {
            if (r.error) {
              toast.error(r.error)
            } else {
              queryClient.invalidateQueries({ queryKey: ['teams'] })
              queryClient.invalidateQueries({ queryKey: ['myTeams'] })
              toast.info(translate("mailValidation.sent.body"))
              toast.success(translate({ key: "Team %s created successfully", replacements: [data.name] }))
            }
          }),
        actionLabel: translate('Create'),
        value: team
      }));
  };


  const _search = (inputValue: string) => {
    return setSearch(inputValue)
  };
  const debouncedSearch = debounce(_search, 100, { leading: true });

  if (myTeamsRequest.isLoading) {
    return <Spinner />
  } else if (myTeamsRequest.data && !isError(myTeamsRequest.data)) {
    return (
      <div>
        <div className="d-flex flex-column panel modal-body">
          <input
            placeholder={translate('search.team.placeholder')}
            className="form-control"
            onChange={(e) => debouncedSearch(e.target.value)}
            autoFocus={true}
          />
          <div className="blocks col-12 mt-3">
            <div className="mb-3 block">
              <div className="ms-2 block__entries block__border d-flex flex-column">
                {myTeamsRequest.data
                  .filter(team => team.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
                  .map((team, resultIdx) => {
                    return (
                      <Link to={`/${team._humanReadableId}/settings/dashboard`}
                        className={classNames("block__entry__link")}
                        key={team._humanReadableId}
                        onClick={close}>
                        {team.name}
                      </Link>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className='btn btn-outline-info d-flex align-items-center gap-2' onClick={() => createTeam()}>
            <Plus />
            <p className="m-0">{translate('dashboard.create.team.button.label')}</p>
          </button>
        </div>
      </div>
    )
  } else (
    <span className="alert alert-danger">{translate('oops, something went wrong.')}</span>
  )

}

export const TeamPanel = () => {
  const { openCustomModal, close } = useContext(ModalContext)
  const { translate } = useContext(I18nContext)
  const { connectedUser } = useContext(GlobalContext)

  const openModal = () => {
    openCustomModal({
      title: translate('topbar.link.my.teams.label'),
      content: <Teams />
    })
  }


  if (connectedUser.isGuest) {
    return null;
  }

  return (
    <button
      title={translate("topbar.link.my.teams.label")}
      aria-label={translate("topbar.link.my.teams.label")}
      className="notification-link notification-link-color a-fake"
      style={{ border: 'none', background: 'none' }}
      onClick={(e) => openModal()}
    >
      {translate('topbar.link.my.teams.label')}
    </button>
  )
}