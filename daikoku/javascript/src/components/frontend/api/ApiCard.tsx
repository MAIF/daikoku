import React, { useContext } from 'react';
import classNames from 'classnames';

import { Can, manage, api as API } from '../../utils';
// @ts-expect-error TS(6142): Module '../../utils/ActionWithTeamSelector' was re... Remove this comment to see the full error message
import { ActionWithTeamSelector } from '../../utils/ActionWithTeamSelector';
// @ts-expect-error TS(6142): Module './StarsButton' was resolved to '/Users/qau... Remove this comment to see the full error message
import StarsButton from './StarsButton';
import { I18nContext } from '../../../core';

export const ApiCard = (props: any) => {
  const allTeamsAreAuthorized =
    props.api.visibility === 'Public' || props.api.authorizations.every((a: any) => a.authorized);

  const isPending =
    props.api.authorizations && props.api.authorizations.every((a: any) => a.pending && !a.authorized);
  const api = props.api;
  const team = props.team || { name: '--', avatar: '#', _id: api.team };

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, Translation } = useContext(I18nContext);

  const accessButton = () => {
    if (
      !allTeamsAreAuthorized &&
      !props.groupView &&
      // !isPending &&
      !['Private', 'AdminOnly'].includes(api.visibility)
    ) {
      return (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <ActionWithTeamSelector
          title="Api access"
          description={translateMethod(
            'api.access.request',
            false,
            `You will send an access request to the API "${api.name}". For which team do you want to send the request ?`,
            [api.name]
          )}
          // @ts-expect-error TS(2322): Type '{ children: Element; title: string; descript... Remove this comment to see the full error message
          buttonLabel="Send"
          pendingTeams={api.authorizations.filter((auth: any) => auth.pending).map((auth: any) => auth.team)}
          authorizedTeams={api.authorizations
            .filter((auth: any) => auth.authorized)
            .map((auth: any) => auth.team)}
          teams={props.myTeams.filter((t: any) => t.type !== 'Admin')}
          action={(teams) => props.askForApiAccess(teams)}
          withAllTeamSelector={true}
        >
          {isPending ? (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <button className="btn btn-sm btn-access-negative me-1">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Translation i18nkey="Pending request">Pending request</Translation>
            </button>
          ) : (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <button className="btn btn-sm btn-access-negative me-1">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <div className="col-12 col-md-4">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="card mb-4 shadow-sm api-card ">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div
            className={classNames('card-img-top card-link card-skin', { 'card-skin': !api.image })}
            data-holder-rendered="true"
          >
            {api.image && (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <img style={{ height: '100%', width: '100%' }} src={api.image} alt={api.name} />
            )}
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            {!api.image && <span>{api.name}</span>}
            {accessButton()}
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Can I={manage} a={API} team={team}>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <button
                type="button"
                className="btn btn-sm btn-access-negative btn-edit"
                onClick={props.redirectToEditPage}
              >
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <i className="fas fa-edit" />
              </button>
            </Can>
          </div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="card-body plan-body d-flex flex-column">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <h4
              className="cursor-pointer underline-on-hover a-fake"
              onClick={props.redirectToApiPage}
            >
              {api.name}
            </h4>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <span className="flex-grow-1 api-description my-2">{api.smallDescription}</span>
            {props.teamVisible && (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <small
                className="cursor-pointer underline-on-hover a-fake d-flex align-items-baseline justify-content-end"
                onClick={() => props.redirectToTeamPage(team)}
              >
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="row border-bottom py-4">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="col-12 d-flex justify-content-between">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="cursor-pointer underline-on-hover a-fake" onClick={props.redirectToApiPage}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <h3>{api.name}</h3>
        </div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="ms-2">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="btn_group d-flex align-items-start">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Can I={manage} a={API} team={team}>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <button
                type="button"
                className="btn btn-sm btn-access-negative me-1 mb-1"
                onClick={props.redirectToEditPage}
              >
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <i className="fas fa-edit" />
              </button>
            </Can>
            {accessButton()}
            {!props.groupView && (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="col-12 lead">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Translation i18nkey={`${api._humanReadableId}.description`} extraConf={api.translation}>
          {api.smallDescription}
        </Translation>
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="col-12 d-flex mt-3">
        {!!api.tags.length && (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <div className="d-flex align-items-center">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <i className="fas fa-tag me-2" />
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="col-12 d-flex mt-1">
        {!!api.categories.length && (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <div className="d-flex">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <i className="fas fa-folder me-2" />
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="col-12 d-flex mt-2">
        {props.teamVisible && (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <small
            className="cursor-pointer underline-on-hover a-fake d-flex align-items-baseline"
            onClick={() => props.redirectToTeamPage(team)}
          >
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <img alt="avatar" src={team.avatar} style={{ marginRight: 5, width: 20 }} />
            {team.name}
          </small>
        )}
      </div>
    </div>
  );
};
