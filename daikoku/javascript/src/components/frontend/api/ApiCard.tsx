import React, { useContext } from 'react';
import classNames from 'classnames';

import { Can, manage, api as API } from '../../utils';
import { ActionWithTeamSelector } from '../../utils/ActionWithTeamSelector';
import StarsButton from './StarsButton';
import { I18nContext } from '../../../core';
import { IApi, IApiWithAuthorization, ITeamSimple, IUserSimple } from '../../../types';

export const ApiCard = (props: {
  key: string
  user: IUserSimple
  api: IApiWithAuthorization
  showTeam: boolean
  teamVisible: boolean
  team?: ITeamSimple
  myTeams: Array<ITeamSimple>
  askForApiAccess: (teams: Array<string>) => Promise<any>
  redirectToTeamPage: (team: ITeamSimple) => void
  redirectToApiPage: () => void
  redirectToEditPage: () => void
  handleTagSelect: (tag: string) => void
  toggleStar: () => void
  handleCategorySelect: (category: string) => void
  view: 'LIST' | 'GRID'
  connectedUser: IUserSimple
  groupView?: boolean
}) => {
  const allTeamsAreAuthorized =
    props.api.visibility === 'Public' || props.api.authorizations.every((a: any) => a.authorized);

  const isPending =
    props.api.authorizations && props.api.authorizations.every((a: any) => a.pending && !a.authorized);
  const api = props.api;
  const team = props.team;

  const { translate, Translation } = useContext(I18nContext);

  const accessButton = () => {
    if (
      !allTeamsAreAuthorized &&
      !props.groupView &&
      // !isPending &&
      !['Private', 'AdminOnly'].includes(api.visibility)
    ) {
      return (
        <ActionWithTeamSelector
          title="Api access"
          description={translate({ key: 'api.access.request', replacements: [api.name] })}
          pendingTeams={api.authorizations.filter((auth: any) => auth.pending).map((auth: any) => auth.team)}
          authorizedTeams={api.authorizations
            .filter((auth) => auth.authorized)
            .map((auth) => auth.team)}
          teams={props.myTeams?.filter((t: any) => t.type !== 'Admin')}
          action={(teams) => props.askForApiAccess(teams)}
          actionLabel={translate("Ask access to API")}
          withAllTeamSelector={true}
        >
          {isPending ? (
            <button className="btn btn-sm btn-access-negative me-1">
              <Translation i18nkey="Pending request">Pending request</Translation>
            </button>
          ) : (
            <button className="btn btn-sm btn-access-negative me-1">
              <Translation i18nkey="Access">Access</Translation>
            </button>
          )}
        </ActionWithTeamSelector>
      );
    }
    return null;
  };

  if (props.view === 'GRID') {
    return (
      <div className="col-12 col-md-4">
        <div className="card mb-4 shadow-sm api-card ">
          <div
            className={classNames('card-img-top card-link card-skin', { 'card-skin': !api.image })}
            data-holder-rendered="true"
          >
            {api.image && (
              <img style={{ height: '100%', width: '100%' }} src={api.image} alt={api.name} />
            )}
            {!api.image && <span>{api.name}</span>}
            {accessButton()}
            <Can I={manage} a={API} team={team}>
              <button
                type="button"
                className="btn btn-sm btn-access-negative btn-edit"
                onClick={props.redirectToEditPage}
              >
                <i className="fas fa-edit" />
              </button>
            </Can>
          </div>
          <div className="card-body plan-body d-flex flex-column">
            <h4
              className="cursor-pointer underline-on-hover a-fake"
              onClick={props.redirectToApiPage}
            >
              {api.name}
            </h4>
            <span className="flex-grow-1 api-description my-2">{api.smallDescription}</span>
            {props.teamVisible && team && (
              <small
                className="cursor-pointer underline-on-hover a-fake d-flex align-items-baseline justify-content-end"
                onClick={() => props.redirectToTeamPage(team)}
              >
                <img alt="avatar" src={team.avatar} style={{ marginRight: 5, width: 20 }} />
                {team.name}
              </small>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="row border-bottom py-4">
      <div className="col-12 d-flex justify-content-between">
        <div className="cursor-pointer underline-on-hover a-fake" onClick={props.redirectToApiPage}>
          <h3>{api.name}</h3>
        </div>
        <div className="ms-2">
          <div className="btn_group d-flex align-items-start">
            <Can I={manage} a={API} team={team}>
              <button
                type="button"
                className="btn btn-sm btn-access-negative me-1 mb-1"
                onClick={props.redirectToEditPage}
              >
                <i className="fas fa-edit" />
              </button>
            </Can>
            {accessButton()}
            {!props.groupView && (
              <StarsButton
                stars={api.stars}
                starred={props.user.starredApis.includes(api._id)}
                toggleStar={props.toggleStar}
                connectedUser={props.connectedUser}
              />
            )}
          </div>
        </div>
      </div>
      <div className="col-12 lead">
        <Translation i18nkey={`${api._humanReadableId}.description`}>
          {api.smallDescription}
        </Translation>
      </div>
      <div className="col-12 d-flex mt-3">
        {!!api.tags.length && (
          <div className="d-flex align-items-center">
            <i className="fas fa-tag me-2" />
            {api.tags.map((tag: any) => <span
              className="badge bg-warning me-1 cursor-pointer"
              key={tag}
              onClick={() => props.handleTagSelect(tag)}
            >
              {tag}
            </span>)}
          </div>
        )}
      </div>
      <div className="col-12 d-flex mt-1">
        {!!api.categories.length && (
          <div className="d-flex">
            <i className="fas fa-folder me-2" />
            {api.categories.map((category: any) => <small
              className="badge bg-warning me-1 cursor-pointer"
              key={category}
              onClick={() => props.handleCategorySelect(category)}
            >
              {category}
            </small>)}
          </div>
        )}
      </div>
      <div className="col-12 d-flex mt-2">
        {props.teamVisible && team && (
          <small
            className="cursor-pointer underline-on-hover a-fake d-flex align-items-baseline"
            onClick={() => props.redirectToTeamPage(team)}
          >
            <img alt="avatar" src={team.avatar} style={{ marginRight: 5, width: 20 }} />
            {team.name}
          </small>
        )}
      </div>
    </div>
  );
};
