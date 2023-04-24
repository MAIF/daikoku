import React, {useContext, useEffect, useMemo, useState} from 'react';
import { useNavigate } from 'react-router-dom';
import { toastr } from 'react-redux-toastr';

import * as Services from '../../../services';
import { AvatarWithAction, Can, manage, tenant } from '../../utils';
import { I18nContext } from '../../../core';
import { ModalContext, useTenantBackOffice } from '../../../contexts';
import { teamSchema } from '../../backoffice/teams/TeamEdit';
import { ITeamSimple, ITeamVisibility} from '../../../types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {getApolloContext} from "@apollo/client";
import Pagination from "react-paginate";
import debounce from "lodash/debounce";

export const TeamList = () => {
  useTenantBackOffice();

  const { translate, Translation } = useContext(I18nContext);
  const { confirm, openFormModal } = useContext(ModalContext);
  const queryClient = useQueryClient();
  const { client } = useContext(getApolloContext());

  const [search, setSearch] = useState<string>("");
  const limit = 8;
  const [page, setPage] = useState<number>(0);
  const [offset, setOffset] = useState<number>(0)
  const dataRequest = useQuery<{teams: Array<ITeamVisibility>, result: number}>({
    queryKey: ["data",
      search,
      limit,
      offset],
    queryFn: ({ queryKey }) => {
      return client!.query<{ teamsPagination: { teams: Array<ITeamVisibility>, result: number}}>({
        query: Services.graphql.getAllTeams,
        fetchPolicy: "no-cache",
        variables: {
          research: queryKey[1],
          limit: queryKey[2],
          offset: queryKey[3]
        }
      }).then(({data: {teamsPagination}}) => {

        return teamsPagination
      })
    },
    enabled: !!client,
    cacheTime: 0
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
                queryClient.invalidateQueries(['teams']);
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
              queryClient.invalidateQueries(['teams']);
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
  },[]);







    const actions = (team: ITeamVisibility) => {
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
            schema: teamSchema(team, translate),
            onSubmit: (data: any) => Services.updateTeam(data)
              .then(r => {
                if (r.error) {
                  toastr.error(translate('Error'), r.error)
                } else {
                  toastr.success(translate('Success'), translate({ key: "team.updated.success", replacements: [data.name] }))
                  queryClient.invalidateQueries(['teams']);
                }
              }),
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



    return (<Can I={manage} a={tenant} dispatchError>
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
              dataRequest.data.teams.map((teamp) => {
                return (
                  <AvatarWithAction key={teamp._id} avatar={teamp.avatar} infos={<>
                    <span className=" section team__name text-truncate">{teamp.name}</span>
                  </>} actions={actions(teamp)} />)
              })}
              <div className="apis__pagination d-flex justify-content-center" style={{ width: '100%' }}>
                <Pagination
                    previousLabel={ translate('Previous')}
                    nextLabel={ translate('Next')}
                    breakLabel={'...'}
                    breakClassName={'break'}
                    pageCount={Math.ceil(dataRequest.data.result / limit)}
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
