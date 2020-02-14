import React, { Component, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { connect } from 'react-redux';
import { toastr } from 'react-redux-toastr';
import classNames from 'classnames';
import Popover from 'react-popover';

import * as Services from '../../../services';
import { TeamBackOffice } from '..';
import {
  formatPlanType,
  Can,
  read,
  apikey,
  isUserIsTeamAdmin,
  CanIDoAction,
  PaginatedComponent,
} from '../../utils';
import { SwitchButton } from '../../inputs';
import { t, Translation } from '../../../locales';

class TeamApiKeysForApiComponent extends Component {
  state = {
    loading: true,
    api: { name: '--', possibleUsagePlans: [] },
    apiTeam: null,
    subscriptions: [],
    searched: '',
    selectedPage: 0,
    offset: 0,
    pageNumber: 5,
  };

  componentDidMount() {
    Promise.all([
      Services.getTeamVisibleApi(this.props.currentTeam._id, this.props.match.params.apiId),
      Services.getTeamSubscriptions(this.props.match.params.apiId, this.props.currentTeam._id),
    ]).then(([api, subscriptions]) =>
      Services.team(api.team).then(apiTeam =>
        this.setState({ api, apiTeam, subscriptions, loading: false })
      )
    );
  }

  updateCustomName = (subscription, customName) => {
    return Services.updateSubscriptionCustomName(this.props.currentTeam, subscription, customName);
  };

  deleteApiKey = subscription => {
    window
      .confirm(
        t(
          'delete.apikey.confirm',
          this.props.currentLanguage,
          'Are you sure to delete this apikey ?'
        )
      )
      .then(ok => {
        if (ok) {
          Services.deleteApiKey(this.props.currentTeam._id, subscription._id)
            .then(() =>
              Services.getTeamSubscriptions(
                this.props.match.params.apiId,
                this.props.currentTeam._id
              )
            )
            .then(subscriptions => this.setState({ subscriptions }));
        }
      });
  };

  archiveApiKey = subscription => {
    return Services.archiveApiKey(this.props.currentTeam._id, subscription._id, !subscription.enabled)
      .then(() =>
        Services.getTeamSubscriptions(this.props.match.params.apiId, this.props.currentTeam._id)
      )
      .then(subscriptions => this.setState({ subscriptions }));
  };

  toggleApiKeyRotation = subscription => {
    return Services.toggleApiKeyRotation(this.props.currentTeam._id, subscription._id)
      .then(result =>
        Services.getTeamSubscriptions(this.props.match.params.apiId, this.props.currentTeam._id)
      )
      .then(subscriptions => this.setState({ subscriptions }));
  };

  regenerateApiKeySecret = subscription => {
    return Services.regenerateApiKeySecret(this.props.currentTeam._id, subscription._id)
      .then(() =>
        Services.getTeamSubscriptions(this.props.match.params.apiId, this.props.currentTeam._id)
      )
      .then(subscriptions => this.setState({ subscriptions }))
      .then(() => toastr.success("secret reseted successfully"));
  };

  currentPlan = subscription => {
    try {
      return this.state.api.possibleUsagePlans.filter(p => p._id === subscription.plan)[0];
    } catch (e) {
      return '--';
    }
  };

  isTeamAdmin = () => {
    if (!this.props.currentTeam) {
      return false;
    }
    const user = this.props.connectedUser;
    return user.isDaikokuAdmin || isUserIsTeamAdmin(user, this.props.currentTeam);
  };

  handlePageClick = data => {
    this.setState({ offset: data.selected * this.state.pageNumber, selectedPage: data.selected });
  };

  render() {
    const showApiKey = CanIDoAction(this.props.connectedUser, read, apikey, this.props.currentTeam);

    const searched = this.state.searched.trim().toLowerCase();
    const filteredApiKeys =
      searched === ''
        ? this.state.subscriptions
        : this.state.subscriptions.filter(subs => {
          if (subs.customName && subs.customName.toLowerCase().includes(searched)) {
            return true;
          } else if (subs.apiKey.clientId.toLowerCase().includes(searched)) {
            return true;
          } else {
            return formatPlanType(this.currentPlan(subs))
              .toLowerCase()
              .includes(searched);
          }
        });

    return (
      <TeamBackOffice
        tab="ApiKeys"
        apiId={this.props.match.params.apiId}
        isLoading={!this.state.apiTeam}>
        <Can I={read} a={apikey} team={this.props.currentTeam} dispatchError>
          {this.state.apiTeam && (
            <div className="row">
              <div className="col-12 d-flex align-items-center">
                <h1>
                  <Translation i18nkey="Api keys for" language={this.props.currentLanguage}>
                    Api keys for
                  </Translation>
                  &nbsp;
                  <Link
                    to={`/${this.state.apiTeam._humanReadableId}/${this.state.api._humanReadableId}`}
                    className="cursor-pointer underline-on-hover a-fake">
                    {this.state.api.name}
                  </Link>
                </h1>
              </div>
              <div className="col-12 mt-2 mb-4">
                <input
                  type="text"
                  className="form-control col-5"
                  placeholder={t('Search your apiKey...', this.props.currentLanguage)}
                  aria-label="Search your apikey"
                  value={this.state.searched}
                  onChange={e =>
                    this.setState({ searched: e.target.value, selectedPage: 0, offset: 0 })
                  }
                />
              </div>

              <div className="col-12">
                <PaginatedComponent
                  currentLanguage={this.props.currentLanguage}
                  items={filteredApiKeys}
                  count={5}
                  formatter={subscription => {
                    const plan = this.currentPlan(subscription);
                    return (
                      <ApiKeyCard
                        currentLanguage={this.props.currentLanguage}
                        openInfoNotif={message => toastr.info(message)}
                        statsLink={`/${this.props.currentTeam._humanReadableId}/settings/apikeys/${this.props.match.params.apiId}/apikey/${subscription.apiKey.clientId}/consumptions`}
                        key={subscription._id}
                        subscription={subscription}
                        showApiKey={showApiKey}
                        plan={plan}
                        updateCustomName={name => this.updateCustomName(subscription, name)}
                        deleteApiKey={() => this.deleteApiKey(subscription)}
                        archiveApiKey={() => this.archiveApiKey(subscription)}
                        toggleRotation={() => this.toggleApiKeyRotation(subscription)}
                        regenerateSecret={() => this.regenerateApiKeySecret(subscription)}
                      />
                    );
                  }}
                />
              </div>
            </div>
          )}
        </Can>
      </TeamBackOffice>
    );
  }
}

const mapStateToProps = state => ({
  ...state.context,
});

export const TeamApiKeysForApi = connect(mapStateToProps)(TeamApiKeysForApiComponent);

const ApiKeyCard = ({
  subscription,
  plan,
  updateCustomName,
  openInfoNotif,
  statsLink,
  deleteApiKey,
  archiveApiKey,
  currentLanguage,
  toggleRotation,
  regenerateSecret
}) => {
  //todo: maybe use showApikey props somewhere
  const [hide, setHide] = useState(true);
  const [settingMode, setSettingMode] = useState(false)
  const [customName, setCustomName] = useState(subscription.customName || plan.type);
  const [rotation, setRotation] = useState(subscription.rotation.enabled)

  console.debug({subscription})

  const { _id, apiKey } = subscription;

  let clipboard = React.createRef();

  const abort = () => {
    setCustomName(subscription.customName || plan.type);
    setRotation(subscription.rotation.enabled)
    setSettingMode(false);
  };

  const handleChanges = () => {
    const promises = [];

    if (customName !== subscription.customName) {
      promises.push(updateCustomName(customName.trim()))
    }

    if (rotation !== rotation.enabled) {
      promises.push(toggleRotation())
    }

    Promise.all(promises)
      .then(() => setSettingMode(false))
  }

  return (
    <div className="col-12 col-sm-6 col-md-4 mb-2">
      <div className="card">

        <div className="card-header">
          <div className="d-flex align-items-center justify-content-between">
            {!settingMode && (
              <h3 style={{ wordBreak: 'break-all', marginBlockEnd: '0' }}>{customName}</h3>
            )}
            {settingMode && (
              <h3><Translation i18nkey="ApiKey settings" language={currentLanguage}>ApiKey settings</Translation></h3>
            )}
          </div>
        </div>
        <div className="card-body">
          {!settingMode && <div>
            <div className="d-flex justify-content-between mb-3">
              <div className="flex-grow-1 justify-content-around">
                <span className="badge badge-secondary">{formatPlanType(plan)}</span>
              </div>
              <div className="d-flex justify-content-around">
                <Link to={statsLink} className="btn btn-sm btn-access-negative">
                  <i className="fas fa-chart-bar" />
                </Link>
                <button
                  type="button"
                  disabled={!subscription.enabled}
                  className="btn btn-sm btn-access-negative ml-1"
                  onClick={() => {
                    clipboard.current.select();
                    document.execCommand('Copy');
                    openInfoNotif(t('Credientials copied', currentLanguage));
                  }}>
                  <i className="fas fa-copy" />
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-access-negative ml-1"
                  onClick={() => setSettingMode(true)}>
                  <i className="fas fa-cog" />
                </button>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor={`client-id-${_id}`} className="">
                <Translation i18nkey="Client Id" language={currentLanguage}>
                  Client Id
                </Translation>
              </label>
              <div className="">
                <input
                  readOnly
                  disabled={!subscription.enabled}
                  className="form-control input-sm"
                  id={`client-id-${_id}`}
                  value={apiKey.clientId}
                />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor={`client-secret-${_id}`} className="">
                <Translation i18nkey="Client secret" language={currentLanguage}>
                  Client secret
                </Translation>
              </label>
              <div className="input-group">
                <input
                  readOnly
                  disabled={!subscription.enabled}
                  type={hide ? 'password' : ''}
                  className="form-control input-sm"
                  id={`client-secret-${_id}`}
                  value={apiKey.clientSecret}
                  aria-describedby={`client-secret-addon-${_id}`}
                />
                <div className="input-group-append">
                  <span
                    onClick={() => {
                      if (subscription.enabled) {
                        setHide(!hide);
                      }
                    }}
                    className={classNames('input-group-text', {
                      'cursor-pointer': subscription.enabled,
                      'cursor-forbidden': !subscription.enabled,
                    })}
                    id={`client-secret-addon-${_id}`}>
                    {hide ? <i className="fas fa-eye" /> : <i className="fas fa-eye-slash" />}
                  </span>
                </div>
              </div>
            </div>
            <input
              ref={clipboard}
              style={{ position: 'fixed', left: 0, top: -250 }}
              type="text"
              readOnly
              value={apiKey.clientId + ':' + apiKey.clientSecret}
            />
          </div>}
          {settingMode && (
            <div className="d-flex flex-column flex-grow-0">
              <div className="d-flex flex-row align-items-start mb-3 pb-3 border-bottom">
                <div className="col-6">
                  <Translation i18nkey="Enabled" language={currentLanguage}>Enabled</Translation>
                  <Help message={t("help.apikey.enabled", currentLanguage, false, "If this ApiKey is disabled, any call using it will fail")} />
                </div>
                <SwitchButton className="col-6" checked={subscription.enabled} onSwitch={archiveApiKey} />
              </div>
              <form>
                <div className="d-flex flex-row align-items-start mb-3">
                  <div className="col-6"><Translation i18nkey="Custom Name" language={currentLanguage}>Custom Name</Translation></div>
                  <input type="text" className="form-control col-6" disabled={!subscription.enabled} defaultValue={customName} onChange={e => setCustomName(e.target.value)}/>
                </div>
                <div className="d-flex flex-row align-items-start mb-3">
                  <div className="col-6">
                    <Translation i18nkey="Rotation" language={currentLanguage}>Rotation</Translation>
                    <Help message={t("help.apikey.rotation", currentLanguage, false, "If rotation is enabled then secret will be reseted every months")} />
                  </div>
                  <SwitchButton className="col-6" disabled={!subscription.enabled} checked={rotation} onSwitch={v => setRotation(v)} />
                </div>
              </form>
              <div className="d-flex justify-content-around">
                <button type="button" className="btn btn-outline-danger" disabled={!subscription.enabled} onClick={regenerateSecret}>
                  <Translation i18nkey="Reset secret" language={currentLanguage}>Reset secret</Translation>
                </button>
                <button className="btn btn-access-negative" onClick={abort}>
                  <Translation i18nkey="Back" language={currentLanguage}>Back</Translation>
                </button>
                <button className="btn btn-access" disabled={!subscription.enabled} onClick={handleChanges}>
                  <Translation i18nkey="Save" language={currentLanguage}>Save</Translation>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Help = ({message}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover isOpen={isOpen} style={{width: "250px", zIndex:100, backgroundColor: "#000", color: "#fff", borderRadius: "4px", padding: "2px 10px"}} body={message}>
        <i
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
          className="ml-4 far fa-question-circle"
        />
    </Popover>
  )
}
