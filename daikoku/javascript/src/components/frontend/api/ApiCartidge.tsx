import React, { useContext } from 'react';
import moment from 'moment';

import { Link } from 'react-router-dom';
import { ActionWithTeamSelector, Can, manage, apikey, CanIDoAction } from '../../utils';
import { I18nContext } from '../../../core';

// @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
const Separator = () => <hr className="hr-apidescription" />;

export function ApiCartidge(props: any) {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, Translation } = useContext(I18nContext);

  const { api, ownerTeam } = props;
  const defaultPlan = api.possibleUsagePlans.filter((p: any) => p._id === api.defaultUsagePlan)[0];
  const pricing = defaultPlan ? defaultPlan.type : 'None';

  const subscribingTeams = props.myTeams
    // .filter((t) => t.type !== 'Admin')
    .filter((team: any) => props.subscriptions.some((sub: any) => sub.team === team._id));

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="d-flex col-12 col-sm-3 col-md-2 text-muted flex-column p-3 additionalContent">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <span>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Translation i18nkey="API by">API by</Translation>
      </span>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <small className="word-break">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Link to={`/${ownerTeam._humanReadableId}`}>{ownerTeam.name}</Link>
      </small>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button className="btn btn-xs btn-access-negative" onClick={props.openContactModal}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <i className="far fa-envelope me-1" />
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="Contact us">Contact us</Translation>
        </button>
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Separator />
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <span>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Translation i18nkey="Version">Version</Translation>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <span className="badge bg-info ms-1">{api.currentVersion}</span>
      </span>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Separator />
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <span>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Translation i18nkey="Supported versions">Supported versions</Translation>
        {(api.supportedVersions || []).map((v: any, idx: any) => (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <span key={idx} className="badge bg-info ms-1">
            {v}
          </span>
        ))}
      </span>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Separator />
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <span>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Translation i18nkey="Tags">Tags</Translation>
        {(api.tags || []).map((a: any, idx: any) => (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <span key={idx} className="badge bg-warning ms-1">
            {a}
          </span>
        ))}
      </span>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Separator />
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <span>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Translation i18nkey="Visibility">Visibility</Translation>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <span className={`badge ms-1 ${api.visibility === 'Public' ? 'bg-success' : 'bg-danger'}`}>
          {translateMethod(api.visibility)}
        </span>
      </span>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Separator />
      {defaultPlan && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <span>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Translation i18nkey="Default plan">Default plan</Translation>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <span className="badge bg-primary word-break ms-1" style={{ whiteSpace: 'normal' }}>
              {defaultPlan.customName || translateMethod(pricing)}
            </span>
          </span>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Separator />
        </>
      )}
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <span>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Translation i18nkey="Last modification">Last modification</Translation>
      </span>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <small>{moment(api.lastUpdate).format(translateMethod('moment.date.format.short'))}</small>

      {!!subscribingTeams.length && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Can I={manage} a={apikey} teams={subscribingTeams}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <ActionWithTeamSelector
            title={translateMethod(
              'teamapi.select.title',
              false,
              'Select the team to view your api key'
            )}
            // @ts-expect-error TS(2554): Expected 8 arguments, but got 4.
            teams={subscribingTeams.filter((t: any) => CanIDoAction(props.connectedUser, manage, apikey, t)
            )}
            action={(teams) => {
              props.redirectToApiKeysPage(props.myTeams.find((t: any) => teams.includes(t._id)));
            }}
            withAllTeamSelector={false}
          >
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <button className="btn btn-sm btn-access-negative mt-2">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Translation i18nkey="View your api keys">View your api keys</Translation>
            </button>
          </ActionWithTeamSelector>
        </Can>
      )}

      {defaultPlan && !defaultPlan.otoroshiTarget && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <small className="mt-5">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="api not linked">
            This api is not linked to an actual Otoroshi service yet
          </Translation>
        </small>
      )}
    </div>
  );
}
