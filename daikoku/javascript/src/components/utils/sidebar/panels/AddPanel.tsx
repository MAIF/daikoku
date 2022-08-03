import React, { useContext } from 'react';
import { useNavigate, useMatch } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';

import * as Services from '../../../../services';
import { openFormModal, openTeamSelectorModal } from '../../../../core/modal';
import { manage, CanIDoAction, api as API, Option } from '../..';
// @ts-expect-error TS(6142): Module '../../../../locales/i18n-context' was reso... Remove this comment to see the full error message
import { I18nContext } from '../../../../locales/i18n-context';
// @ts-expect-error TS(6142): Module '../../../backoffice/teams/TeamEdit' was re... Remove this comment to see the full error message
import { teamSchema } from '../../../backoffice/teams/TeamEdit'
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { toastr } from 'react-redux-toastr';

export const AddPanel = ({
  teams
}: any) => {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  const { tenant, connectedUser, apiCreationPermitted } = useSelector((state) => (state as any).context);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const match = useMatch('/:teamId/settings/*');

  const myTeams = teams.filter(
    (t: any) => connectedUser.isDaikokuAdmin || t.users.some((u: any) => u.userId === connectedUser._id)
  );

  const createTeam = () => {
    Services.fetchNewTeam()
      .then((team) => dispatch(openFormModal({
        title: translateMethod('Create a new team'),
        schema: teamSchema(team, translateMethod),
        onSubmit: (data: any) => Services.createTeam(data)
          .then(r => {
            if (r.error) {
              toastr.error(r.error)
            } else {
              toastr.success(translateMethod("Team %s created successfully", false, "", data.name))
            }
          }),
        actionLabel: translateMethod('Create'),
        value: team
      })));
  };

  const createApi = (teamId: any) => {
    if (apiCreationPermitted) {
      if (!teamId) {
        return openTeamSelectorModal({
          allTeamSelector: false,
          title: translateMethod('api.creation.title.modal'),
          description: translateMethod('api.creation.description.modal'),
          teams: myTeams
            .filter((t: any) => t.type !== 'Admin')
            .filter((t: any) => !tenant.creationSecurity || t.apisCreationPermission)
            // @ts-expect-error TS(2554): Expected 8 arguments, but got 5.
            .filter((t: any) => CanIDoAction(connectedUser, manage, API, t, apiCreationPermitted)),
          action: (teams: any) => createApi(teams[0]),
        })(dispatch);
      } else {
        const team = myTeams.find((t: any) => teamId === t._id);

        return Services.fetchNewApi()
          .then((e) => {
            return { ...e, team: team._id };
          })
          .then((newApi) =>
            navigate(`/${team._humanReadableId}/settings/apis/${newApi._id}/infos`, {
              state: { newApi },
            })
          );
      }
    }
  };

  const createApiGroup = (teamId: any) => {
    if (apiCreationPermitted) {
      if (!teamId) {
        return openTeamSelectorModal({
          allTeamSelector: false,
          title: translateMethod('apigroup.creation.title.modal'),
          description: translateMethod('apigroup.creation.description.modal'),
          teams: myTeams
            .filter((t: any) => t.type !== 'Admin')
            .filter((t: any) => !tenant.creationSecurity || t.apisCreationPermission)
            // @ts-expect-error TS(2554): Expected 8 arguments, but got 5.
            .filter((t: any) => CanIDoAction(connectedUser, manage, API, t, apiCreationPermitted)),
          action: (teams: any) => createApiGroup(teams[0]),
        })(dispatch);
      } else {
        const team = myTeams.find((t: any) => teamId === t._id);

        return Services.fetchNewApiGroup()
          .then((e) => {
            return { ...e, team: team._id };
          })
          .then((newApiGroup) =>
            navigate(`/${team._humanReadableId}/settings/apigroups/${newApiGroup._id}/infos`, {
              state: { newApiGroup },
            })
          );
      }
    }
  };

  const maybeTeam = Option(match)
    .map((m: any) => m.params)
    .map((p: any) => p.teamId)
    .map((id: any) => myTeams.find((t: any) => t._humanReadableId === id))
    // @ts-expect-error TS(2554): Expected 8 arguments, but got 5.
    .filter((t: any) => CanIDoAction(connectedUser, manage, API, t, apiCreationPermitted))
    .map((t: any) => t._id)
    .getOrNull();

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="ms-3 mt-2 col-8 d-flex flex-column panel">
      {/* todo: add a title if API page or tenant or Team */}
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <h3>{translateMethod('Create')}</h3>
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="blocks">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="mb-3 block">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="block__entries d-flex flex-column">
            {connectedUser.isDaikokuAdmin && (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <span className="block__entry__link d-flex align-items-center justify-content-between">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <span>{translateMethod('Tenant')}</span>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <button className="btn btn-sm btn-access-negative me-1">
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <i className="fas fa-plus-circle" />
                </button>
              </span>
            )}
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <span
              className="block__entry__link d-flex align-items-center justify-content-between"
              onClick={createTeam}
            >
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <span>{translateMethod('Team')}</span>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <button className="btn btn-sm btn-access-negative me-1">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <i className="fas fa-plus-circle" />
              </button>
            </span>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <span
              className="block__entry__link d-flex align-items-center justify-content-between"
              onClick={() => createApi(maybeTeam)}
            >
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <span>{translateMethod('API')}</span>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <button className="btn btn-sm btn-access-negative me-1">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <i className="fas fa-plus-circle" />
              </button>
            </span>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <span
              className="block__entry__link d-flex align-items-center justify-content-between"
              onClick={() => createApiGroup(maybeTeam)}
            >
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <span>{translateMethod('API group')}</span>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <button className="btn btn-sm btn-access-negative me-1">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <i className="fas fa-plus-circle" />
              </button>
            </span>
          </div>
        </div>
        {/* todo: add a block in function of context to create plan...otoroshi or whatever */}
      </div>
    </div>
  );
};
