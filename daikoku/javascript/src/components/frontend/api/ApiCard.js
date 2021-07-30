import React from 'react';
import classNames from 'classnames';

import { Can, manage, api as API } from '../../utils';
import { ActionWithTeamSelector } from '../../utils/ActionWithTeamSelector';
import { Translation, t } from '../../../locales';
import StarsButton from './StarsButton';

export const ApiCard = (props) => {
  const isAuthorized =
    props.api.visibility === 'Public' || props.api.authorizations.some((a) => a.authorized);
  const allTeamsAreAuthorized =
    props.api.visibility === 'Public' || props.api.authorizations.every((a) => a.authorized);
  const isPending =
    props.api.authorizations && props.api.authorizations.every((a) => a.pending && !a.authorized);
  const api = props.api;
  const team = props.team || { name: '--', avatar: '#', _id: api.team };

  console.log(props.api)

  const redirectToApiPage = (auth) => {
    if (auth) {
      props.redirectToApiPage();
    }
  };

  const accessButton = () => {
    if (
      !allTeamsAreAuthorized &&
      !isPending &&
      !['Private', 'AdminOnly'].includes(api.visibility)
    ) {
      return (
        <ActionWithTeamSelector
          title="Api access"
          description={t(
            'api.access.request',
            props.currentLanguage,
            false,
            `You will send an access request to the API "${api.name}". For which team do you want to send the request ?`,
            [api.name]
          )}
          buttonLabel="Send"
          pendingTeams={api.authorizations.filter((auth) => auth.pending).map((auth) => auth.team)}
          authorizedTeams={api.authorizations
            .filter((auth) => auth.authorized)
            .map((auth) => auth.team)}
          teams={props.myTeams.filter((t) => t.type !== 'Admin')}
          action={(teams) => props.askForApiAccess(teams)}
          withAllTeamSelector={true}>
          <button className="btn btn-sm btn-access-negative mr-1">
            <Translation i18nkey="Access" language={props.currentLanguage}>
              Access
            </Translation>
          </button>
        </ActionWithTeamSelector>
      );
    } else if (isPending) {
      return (
        <button className="btn btn-sm btn-access-negative mr-1">
          <Translation i18nkey="Pending request" language={props.currentLanguage}>
            Pending request
          </Translation>
        </button>
      );
    }
    return null;
  };

  if (props.view === 'GRID') {
    return (
      <div className="card mb-4 shadow-sm api-card" style={{ width: '250px' }}>
        <div
          className={classNames('card-img-top card-link card-skin', { 'card-skin': !api.image })}
          data-holder-rendered="true">
          {api.image && (
            <img style={{ height: '100%', width: '100%' }} src={api.image} alt={api.name} />
          )}
          {!api.image && <span>{api.name}</span>}
          {accessButton()}
          <Can I={manage} a={API} team={team}>
            <button
              type="button"
              className="btn btn-sm btn-access-negative btn-edit"
              onClick={props.redirectToEditPage}>
              <i className="fas fa-edit" />
            </button>
          </Can>
        </div>
        <div className="card-body plan-body d-flex flex-column">
          <h4
            className={isAuthorized ? 'cursor-pointer underline-on-hover a-fake' : 'api--forbidden'}
            onClick={() => redirectToApiPage(isAuthorized)}>
            {api.name}
          </h4>
          <span className="flex-grow-1 api-description my-2">{api.smallDescription}</span>
          {props.teamVisible && (
            <small
              className="cursor-pointer underline-on-hover a-fake d-flex align-items-center justify-content-end"
              onClick={() => props.redirectToTeamPage(team)}>
              <img alt="avatar" src={team.avatar} style={{ marginRight: 5, width: 20 }} />
              {team.name}
            </small>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="row border-bottom py-4">
      <div className="col-12 d-flex justify-content-between">
        <div
          className={isAuthorized ? 'cursor-pointer underline-on-hover a-fake' : 'api--forbidden'}
          onClick={() => redirectToApiPage(isAuthorized)}>
          <h3>{api.name}</h3>
        </div>
        <div className="ml-2">
          <div className="btn_group d-flex align-items-start">
            <Can I={manage} a={API} team={team}>
              <button
                type="button"
                className="btn btn-sm btn-access-negative mr-1 mb-1"
                onClick={props.redirectToEditPage}>
                <i className="fas fa-edit" />
              </button>
            </Can>
            {accessButton()}
            <StarsButton
              stars={api.stars}
              starred={props.user.starredApis.includes(api._id)}
              toggleStar={props.toggleStar}
              currentLanguage={props.currentLanguage}
              connectedUser={props.connectedUser}
            />
          </div>
        </div>
      </div>
      <div className="col-12 lead">
        <Translation
          language={props.currentLanguage}
          i18nkey={`${api._humanReadableId}.description`}
          extraConf={api.translation}>
          {api.smallDescription}
        </Translation>
      </div>
      <div className="col-12 d-flex mt-3">
        {!!api.tags.length && (
          <div className="d-flex">
            <i className="fas fa-tag mr-2" />
            {api.tags.map((tag) => (
              <span
                className="badge badge-warning mr-1 cursor-pointer"
                key={tag}
                onClick={() => props.handleTagSelect(tag)}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="col-12 d-flex mt-1">
        {!!api.categories.length && (
          <div className="d-flex">
            <i className="fas fa-folder mr-2" />
            {api.categories.map((category) => (
              <small
                className="badge badge-warning mr-1 cursor-pointer"
                key={category}
                onClick={() => props.handleCategorySelect(category)}>
                {category}
              </small>
            ))}
          </div>
        )}
      </div>
      <div className="col-12 d-flex mt-2">
        {props.teamVisible && (
          <small
            className="cursor-pointer underline-on-hover a-fake d-flex align-items-center"
            onClick={() => props.redirectToTeamPage(team)}>
            <img alt="avatar" src={team.avatar} style={{ marginRight: 5, width: 20 }} />
            {team.name}
          </small>
        )}
      </div>
    </div>
  );
};
