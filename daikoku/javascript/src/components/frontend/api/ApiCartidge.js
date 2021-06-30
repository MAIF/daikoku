import React, { Component } from 'react';
import moment from 'moment';

import { Link } from 'react-router-dom';
import { ActionWithTeamSelector, Can, manage, apikey, CanIDoAction } from '../../utils';
import { Translation, t } from '../../../locales';

const Separator = () => <hr className="hr-apidescription" />;

export class ApiCartidge extends Component {
  render() {
    const { api, ownerTeam } = this.props;
    const defaultPlan = api.possibleUsagePlans.filter((p) => p._id === api.defaultUsagePlan)[0];
    const pricing = defaultPlan ? defaultPlan.type : 'None';

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
            className={`badge ml-1 ${api.visibility === 'Public' ? 'badge-success' : 'badge-danger'
              }`}>
            {t(api.visibility, this.props.currentLanguage)}
          </span>
        </span>
        <Separator />
        {defaultPlan && (
          <>
            <span>
              <Translation i18nkey="Default plan" language={this.props.currentLanguage}>
                Default plan
              </Translation>
              <span
                className="badge badge-primary word-break ml-1"
                style={{ whiteSpace: 'normal' }}>
                {defaultPlan.customName || t(pricing, this.props.currentLanguage)}
              </span>
            </span>
            <Separator />
          </>
        )}
        <span>
          <Translation i18nkey="Last modification" language={this.props.currentLanguage}>
            Last modification
          </Translation>
        </span>
        <small>
          {moment(api.lastUpdate).format(t('moment.date.format.short', this.props.currentLanguage))}
        </small>

        {!!subscribingTeams.length && (
          <Can I={manage} a={apikey} teams={subscribingTeams}>
            <ActionWithTeamSelector
              title={t(
                'teamapi.select.title',
                this.props.currentLanguage,
                'Select the team to view your api key'
              )}
              teams={subscribingTeams.filter((t) =>
                CanIDoAction(this.props.connectedUser, manage, apikey, t)
              )}
              action={teams =>
                this.props.redirectToApiKeysPage(this.props.myTeams.find(t => teams.includes(t._id)))
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
