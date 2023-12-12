import { getApolloContext } from "@apollo/client";
import { type } from '@maif/react-forms';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import debounce from "lodash/debounce";
import { useContext, useEffect, useMemo, useState } from 'react';
import Pagination from "react-paginate";
import { toastr } from 'react-redux-toastr';
import { useNavigate } from 'react-router-dom';

import { ModalContext, useTenantBackOffice } from '../../../contexts';
import { I18nContext } from '../../../core';
import * as Services from '../../../services';
import { ITeamFull, ITeamFullGql, ITeamSimple } from '../../../types';
import { teamSchema } from '../../backoffice/teams/TeamEdit';
import { AvatarWithAction, Can, manage, teamPermissions, tenant as TENANT } from '../../utils';

export const TeamList = () => {
  const { tenant } = useTenantBackOffice();

  const { translate, Translation } = useContext(I18nContext);
  const { confirm, openFormModal } = useContext(ModalContext);
  const queryClient = useQueryClient();
  const { client } = useContext(getApolloContext());

  const [search, setSearch] = useState<string>("");
  const limit = 10;
  const [page, setPage] = useState<number>(0);
  const [offset, setOffset] = useState<number>(0)
  const dataRequest = useQuery<{ teams: Array<ITeamFullGql>, total: number }>({
    queryKey: ["data",
      search,
      limit,
      offset],
    queryFn: ({ queryKey }) => {
      return client!.query<{ teamsPagination: { teams: Array<ITeamFullGql>, total: number } }>({
        query: Services.graphql.getAllTeams,
        fetchPolicy: "no-cache",
        variables: {
          research: queryKey[1],
          limit: queryKey[2],
          offset: queryKey[3]
        }
      }).then(({ data: { teamsPagination } }) => {

        return teamsPagination
      })
    },
    enabled: !!client,
    gcTime: 0
  })


  const navigate = useNavigate();

  const createNewTeam = () => {
    Services.fetchNewTeam()
      .then((newTeam) => {
        openFormModal({
          title: translate('Create a new team'),
          actionLabel: translate('Create'),
          schema: teamSchema(newTeam, translate),
          onSubmit: (data: ITeamSimple) => Services.createTeam(data)
            .then(r => {
              if (r.error) {
                toastr.error(translate('Error'), r.error)
              } else {
                queryClient.invalidateQueries({ queryKey: ['teams'] });
                toastr.info(
                  translate("mailValidation.sent.title"),
                  translate("mailValidation.sent.body"))
                toastr.success(translate('Success'), translate({ key: "team.created.success", replacements: [data.name] }))
              }
            }),
          value: newTeam
        })
      });
  };


  const deleteTeam = (teamId: string) => {
    confirm({ message: translate('delete team') })
      .then((ok) => {
        if (ok) {
          Services.deleteTeam(teamId)
            .then(() => {
              queryClient.invalidateQueries({ queryKey: ['teams'] });
            });
        }
      });
  };

  const handleChange = (e) => {
    setPage(0)
    setOffset(0)
    setSearch(e.target.value);
  };

  const debouncedResults = useMemo(() => {
    return debounce(handleChange, 500);
  }, []);

  useEffect(() => {
    return () => {
      debouncedResults.cancel();
    };
  }, []);







  const actions = (team: ITeamFullGql) => {
    const basicActions = [
      {
        action: () => deleteTeam(team._id),
        variant: 'error',
        iconClass: 'fas fa-trash delete-icon',
        tooltip: translate('Delete team'),
      },
      {
        redirect: () => openFormModal({
          title: translate('Update team'),
          actionLabel: translate('Update'),
          schema: {
            ...teamSchema(team, translate),
            apisCreationPermission: {
              type: type.bool,
              defaultValue: false,
              label: translate('APIs creation permission'),
              help: translate('apisCreationPermission.help'),
              visible: !!tenant.creationSecurity
            },
            metadata: {
              type: type.object,
              label: translate('Metadata'),
            }
          },
          onSubmit: (data) => {
            const teamToUpdate: ITeamFull = {
              ...data,
              '_tenant': data.tenant.id,
              users: data.users.map(({ user, teamPermission }) => ({ userId: user.userId, teamPermission }))
            }
            return Services.updateTeam(teamToUpdate)
              .then(r => {
                if (r.error) {
                  toastr.error(translate('Error'), r.error)
                } else {
                  toastr.success(translate('Success'), translate({ key: "team.updated.success", replacements: [data.name] }))
                  queryClient.invalidateQueries({ queryKey: ['teams'] });
                }
              })
          },
          value: team
        }),
        iconClass: 'fas fa-pen',
        tooltip: translate('Edit team'),
        actionLabel: translate('Create')
      },
    ];

    if (team.type === 'Personal') {
      return basicActions;
    }

    return [
      ...basicActions,
      {
        action: () => navigate(`/settings/teams/${team._humanReadableId}/members`),
        iconClass: 'fas fa-users',
        tooltip: translate('Team members'),
      },
    ];
  };
  const handlePageClick = (data) => {
    setPage(data.selected);
    setOffset(data.selected)
  };



  return (<Can I={manage} a={TENANT} dispatchError>
    <div className="row">
      <div className="d-flex justify-content-between align-items-center">
        <h1>
          <Translation i18nkey="Teams">Teams</Translation>
          <button
            className="btn btn-sm btn-access-negative mb-1 ms-1"
            title={translate('Create a new team')}
            onClick={createNewTeam}>
            <i className="fas fa-plus-circle" />
          </button>
        </h1>
        <div className="col-5">
          <input
            placeholder={translate('Find a team')}
            className="form-control"
            onChange={(e) => {
              debouncedResults(e)
            }} />
        </div>
      </div>
      {!dataRequest.isLoading && !dataRequest.isError && dataRequest.data &&
        <div className="d-flex flex-wrap section">{
          dataRequest.data.teams.map((team) => {
            return (
              <AvatarWithAction key={team._id} avatar={team.avatar} infos={<>
                <span className=" section team__name text-truncate">{team.name}</span>
              </>} actions={actions(team)} />)
          })}
          <div className="apis__pagination d-flex justify-content-center" style={{ width: '100%' }}>
            <Pagination
              previousLabel={translate('Previous')}
              nextLabel={translate('Next')}
              breakLabel={'...'}
              breakClassName={'break'}
              pageCount={Math.ceil(dataRequest.data.total / limit)}
              marginPagesDisplayed={1}
              pageRangeDisplayed={5}
              onPageChange={(data) => handlePageClick(data)}
              containerClassName={'pagination'}
              pageClassName={'page-selector'}
              forcePage={page}
              activeClassName={'active'} />
          </div>
        </div>}
    </div>
  </Can>);



};
