import React, { Component } from 'react';
import moment from 'moment';

import { Link } from 'react-router-dom';
import { ActionWithTeamSelector, Can, read, apikey, access } from '../../utils';
import { Translation, t } from '../../../locales';
import _ from 'lodash';

const Separator = () => <hr className="hr-apidescription" />;

export class ApiCartidge extends Component {
  render() {
    const { api, ownerTeam } = this.props;
    const defaultPlan = api.possibleUsagePlans.filter((p) => p._id === api.defaultUsagePlan)[0];
    const pricing = defaultPlan ? defaultPlan.type : 'None';

    const authorizedTeams = this.props.myTeams.filter(
      (t) =>
        this.props.api.visibility === 'Public' || this.props.api.authorizedTeams.includes(t._id)
    );
    const allPossibleTeams = _.difference(
      authorizedTeams.map((t) => t._id),
      this.props.subscriptions
        .filter((sub) => !defaultPlan || sub.plan === defaultPlan._id)
        .map((s) => s.team)
    );
    const isAccepted = !allPossibleTeams.length;
    const isPending =
      !isAccepted &&
      !_.difference(
        allPossibleTeams,
        this.props.pendingSubscriptions
          .filter((sub) => !defaultPlan || sub.action.plan === defaultPlan._id)
          .map((s) => s.action.team)
      ).length;

    const subscribingTeams = this.props.myTeams
      .filter((t) => t.type !== 'Admin')
      .filter((team) => this.props.subscriptions.some((sub) => sub.team === team._id));

    return (
      <div className="d-flex col-12 col-sm-3 col-md-2 text-muted flex-column p-3 additionalContent">
        <span>
          <Translation i18nkey="API by" language={this.props.currentLanguage}>
            API by
          </Translation>
        </span>
        <small className="word-break">
          <Link to={`/${ownerTeam._humanReadableId}`}>{ownerTeam.name}</Link>
        </small>
        <div>
          <button className="btn btn-xs btn-access-negative" onClick={this.props.openContactModal}>
            <i className="far fa-envelope mr-1" />
            <Translation i18nkey="Contact us" language={this.props.currentLanguage}>
              Contact us
            </Translation>
          </button>
        </div>
        <Separator />
        <span>
          <Translation i18nkey="Version" language={this.props.currentLanguage}>
            Version
          </Translation>
          <span className="badge badge-info ml-1">{api.currentVersion}</span>
        </span>
        <Separator />
        <span>
          <Translation i18nkey="Supported versions" language={this.props.currentLanguage}>
            Supported versions
          </Translation>
          {(api.supportedVersions || []).map((v, idx) => (
            <span key={idx} className="badge badge-info ml-1">
              {v}
            </span>
          ))}
        </span>
        <Separator />
        <span>
          <Translation i18nkey="Tags" language={this.props.currentLanguage}>
            Tags
          </Translation>
          {(api.tags || []).map((a, idx) => (
            <span key={idx} className="badge badge-warning ml-1">
              {a}
            </span>
          ))}
        </span>
        <Separator />
        <span>
          <Translation i18nkey="Visibility" language={this.props.currentLanguage}>
            Visibility
          </Translation>
          <span
            className={`badge ml-1 ${
              api.visibility === 'Public' ? 'badge-success' : 'badge-danger'
            }`}>
            {t(api.visibility, this.props.currentLanguage)}
          </span>
        </span>
        <Separator />
        <span>
          <Translation i18nkey="Default pricing" language={this.props.currentLanguage}>
            Default pricing
          </Translation>
          <span className="badge badge-primary word-break ml-1" style={{ whiteSpace: 'normal' }}>
            {t(pricing, this.props.currentLanguage)}
          </span>
        </span>
        <Separator />
        <span>
          <Translation i18nkey="Last modification" language={this.props.currentLanguage}>
            Last modification
          </Translation>
        </span>
        <small>
          {moment(api.lastUpdate).format(t('moment.date.format.short', this.props.currentLanguage))}
        </small>

        {!!subscribingTeams.length && (
          <Can I={read} a={apikey} teams={subscribingTeams}>
            <ActionWithTeamSelector
              title={t(
                'teamapi.select.title',
                this.props.currentLanguage,
                'Select the team to view your api key'
              )}
              teams={subscribingTeams}
              action={(team) =>
                this.props.redirectToApiKeysPage(this.props.myTeams.find((t) => t._id === team))
              }
              currentLanguage={this.props.currentLanguage}
              withAllTeamSelector={false}>
              <button className="btn btn-sm btn-access-negative mt-2">
                <Translation i18nkey="View your api keys" language={this.props.currentLanguage}>
                  View your api keys
                </Translation>
              </button>
            </ActionWithTeamSelector>
          </Can>
        )}
        {defaultPlan && defaultPlan.otoroshiTarget && isPending && (
          <button type="button" className="btn btn-sm btn-access-negative mt-5">
            <Translation i18nkey="Request in progress" language={this.props.currentLanguage}>
              Request in progress
            </Translation>
          </button>
        )}
        {this.props.api.published &&
          defaultPlan &&
          defaultPlan.otoroshiTarget &&
          !isAccepted &&
          !isPending && (
            <Can
              I={access}
              a={apikey}
              teams={authorizedTeams.filter(
                (team) =>
                  defaultPlan.visibility === 'Public' || team._id === this.props.ownerTeam._id
              )}>
              <ActionWithTeamSelector
                title={t(
                  'team.selection.title',
                  this.props.currentLanguage,
                  false,
                  'Select the team of the subscription'
                )}
                description={t(
                  'team.selection.desc',
                  this.props.currentLanguage,
                  false,
                  'You are going to subscribe to the api. On which team do you want to make this subscriptions ?'
                )}
                buttonLabel="subscribe"
                currentLanguage={this.props.currentLanguage}
                teams={this.props.myTeams
                  .filter((t) => t.type !== 'Admin')
                  .filter(
                    (team) =>
                      defaultPlan.visibility === 'Public' || team._id === this.props.ownerTeam._id
                  )}
                pendingTeams={this.props.pendingSubscriptions.map((s) => s.action.team)}
                authorizedTeams={this.props.subscriptions
                  .filter((subs) => subs.plan === defaultPlan._id)
                  .map((subs) => subs.team)}
                action={(teams) => this.props.askForApikeys(teams, defaultPlan)}
                withAllTeamSelector={true}>
                <button type="button" className="btn btn-sm btn-access-negative mt-5">
                  <Translation i18nkey="Subscribe" language={this.props.currentLanguage}>
                    Subscribe
                  </Translation>
                </button>
              </ActionWithTeamSelector>
            </Can>
          )}
        {defaultPlan && !defaultPlan.otoroshiTarget && (
          <small className="mt-5">
            <Translation i18nkey="api not linked" language={this.props.currentLanguage}>
              This api is not linked to an actual Otoroshi service yet
            </Translation>
          </small>
        )}
      </div>
    );
  }
}
