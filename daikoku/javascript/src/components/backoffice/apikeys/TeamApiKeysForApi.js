import React, { useState, useEffect, useContext } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { connect } from 'react-redux';
import { toastr } from 'react-redux-toastr';
import classNames from 'classnames';
import { sortBy } from 'lodash';

import * as Services from '../../../services';
import { TeamBackOffice } from '..';
import {
  formatPlanType,
  Can,
  read,
  apikey,
  stat,
  CanIDoAction,
  PaginatedComponent,
  BeautifulTitle,
  Option,
} from '../../utils';
import { SwitchButton } from '../../inputs';
import { I18nContext } from '../../../core';

function TeamApiKeysForApiComponent(props) {
  const [api, setApi] = useState({ name: '--', possibleUsagePlans: [] });
  const [apiTeam, setApiTeam] = useState();
  const [subscriptions, setSubscriptions] = useState([]);
  const [searched, setSearched] = useState('');

  const location = useLocation();
  const params = useParams();

  const { translateMethod, Translation } = useContext(I18nContext);

  useEffect(() => {
    Promise.all([
      Services.getTeamVisibleApi(props.currentTeam._id, props.match.params.apiId, params.versionId),
      Services.getTeamSubscriptions(
        props.match.params.apiId,
        props.currentTeam._id,
        params.versionId
      ),
    ]).then(([api, subscriptions]) => {
      setSubscriptions(subscriptions);
      setApi(api);
      Services.team(api.team).then((apiTeam) => setApiTeam(apiTeam));
    });
  }, [location]);

  const updateCustomName = (subscription, customName) => {
    return Services.updateSubscriptionCustomName(props.currentTeam, subscription, customName);
  };

  const archiveApiKey = (subscription) => {
    return Services.archiveApiKey(props.currentTeam._id, subscription._id, !subscription.enabled)
      .then(() =>
        Services.getTeamSubscriptions(
          props.match.params.apiId,
          props.currentTeam._id,
          params.versionId
        )
      )
      .then((subs) => setSubscriptions(subs));
  };

  const makeUniqueApiKey = (subscription) => {
    window
      .confirm(translateMethod('team_apikey_for_api.ask_for_make_unique'))
      .then((ok) => {
        if (ok)
          Services.makeUniqueApiKey(props.currentTeam._id, subscription._id).then(() =>
            Services.getTeamSubscriptions(
              props.match.params.apiId,
              props.currentTeam._id,
              params.versionId
            )
          );
        then((subs) => setSubscriptions(subs));
      });
  };

  const toggleApiKeyRotation = (subscription, plan, rotationEvery, gracePeriod) => {
    if (plan.autoRotation) {
      return toastr.error(
        translateMethod('Error', false, 'Error'),
        translateMethod(
          'rotation.error.message',
          false,
          "You can't toggle rotation because of plan rotation is forced to enabled"
        )
      );
    }

    return Services.toggleApiKeyRotation(
      props.currentTeam._id,
      subscription._id,
      rotationEvery,
      gracePeriod
    )
      .then(() =>
        Services.getTeamSubscriptions(
          props.match.params.apiId,
          props.currentTeam._id,
          params.versionId
        )
      )
      .then((subs) => setSubscriptions(subs));
  };

  const regenerateApiKeySecret = (subscription) => {
    return window
      .confirm(
        translateMethod(
          'reset.secret.confirm',
          false,
          'Are you sure you want to reset this secret ?'
        )
      )
      .then((ok) => {
        if (ok) {
          Services.regenerateApiKeySecret(props.currentTeam._id, subscription._id)
            .then(() =>
              Services.getTeamSubscriptions(
                props.match.params.apiId,
                props.currentTeam._id,
                params.versionId
              )
            )
            .then((subs) => setSubscriptions(subs))
            .then(() => toastr.success('secret reseted successfully'));
        }
      });
  };

  const currentPlan = (subscription) => {
    try {
      return api.possibleUsagePlans.filter((p) => p._id === subscription.plan)[0];
    } catch (e) {
      return '--';
    }
  };

  const showApiKey = CanIDoAction(props.connectedUser, read, apikey, props.currentTeam);

  const search = searched.trim().toLowerCase();
  const filteredApiKeys =
    search === ''
      ? subscriptions
      : subscriptions.filter((subs) => {
        const plan = currentPlan(subs);

        if (plan && plan.customName && plan.customName.toLowerCase().includes(search)) {
          return true;
        } else if (subs.customName && subs.customName.toLowerCase().includes(search)) {
          return true;
        } else {
          return formatPlanType(currentPlan(subs), translateMethod).toLowerCase().includes(search);
        }
      });

  const sorted = sortBy(filteredApiKeys, ['plan', 'customName', 'parent']);
  const sortedApiKeys = sorted
    .filter((f) => f.parent)
    .reduce(
      (acc, sub) => {
        return acc.find((a) => a._id === sub.parent)
          ? acc.map((a) => {
            if (a._id === sub.parent) a.children.push(sub);
            return a;
          })
          : [...acc, { ...sub, children: [] }];
      },
      sorted.filter((f) => !f.parent).map((sub) => ({ ...sub, children: [] }))
    );

  return (
    <TeamBackOffice
      title={`${props.currentTeam.name} - ApiKeys`}
      tab="ApiKeys"
      apiId={props.match.params.apiId}
      isLoading={!apiTeam}>
      <Can I={read} a={apikey} team={props.currentTeam} dispatchError>
        {api && apiTeam ? (
          <div className="row">
            <div className="col-12 d-flex align-items-center">
              <h1>
                <Translation i18nkey="Api keys for">
                  Api keys for
                </Translation>
                &nbsp;
                <Link
                  to={`/${apiTeam._humanReadableId}/${api._humanReadableId}/${api.currentVersion}`}
                  className="cursor-pointer underline-on-hover a-fake">
                  {api.name}
                </Link>
              </h1>
            </div>
            <div className="col-12 mt-2 mb-4">
              <input
                type="text"
                className="form-control col-5"
                placeholder={translateMethod('Search your apiKey...')}
                aria-label="Search your apikey"
                value={searched}
                onChange={(e) => setSearched(e.target.value)}
              />
            </div>

            <div className="col-12">
              <PaginatedComponent
                items={sortedApiKeys}
                count={5}
                formatter={(subscription) => {
                  const plan = currentPlan(subscription);

                  return (
                    <ApiKeyCard
                      currentTeam={props.currentTeam}
                      openInfoNotif={(message) => toastr.info(message)}
                      statsLink={`/${props.currentTeam._humanReadableId}/settings/apikeys/${props.match.params.apiId}/${props.match.params.versionId}/subscription/${subscription._id}/consumptions`}
                      key={subscription._id}
                      subscription={subscription}
                      showApiKey={showApiKey}
                      plan={plan}
                      api={api}
                      updateCustomName={(name) => updateCustomName(subscription, name)}
                      archiveApiKey={() => archiveApiKey(subscription)}
                      makeUniqueApiKey={() => makeUniqueApiKey(subscription)}
                      toggleRotation={(rotationEvery, gracePeriod) =>
                        toggleApiKeyRotation(subscription, plan, rotationEvery, gracePeriod)
                      }
                      regenerateSecret={() => regenerateApiKeySecret(subscription)}
                      disableRotation={api.visibility === 'AdminOnly'}
                    />
                  );
                }}
              />
            </div>
          </div>
        ) : null}
      </Can>
    </TeamBackOffice>
  );
}

const mapStateToProps = (state) => ({
  ...state.context,
});

export const TeamApiKeysForApi = connect(mapStateToProps)(TeamApiKeysForApiComponent);

const ApiKeyCard = ({
  subscription,
  plan,
  updateCustomName,
  openInfoNotif,
  statsLink,
  archiveApiKey,
  makeUniqueApiKey,
  toggleRotation,
  regenerateSecret,
  currentTeam,
  disableRotation,
}) => {
  //todo: maybe use showApikey props somewhere
  const [hide, setHide] = useState(true);
  const [settingMode, setSettingMode] = useState(false);
  const [customName, setCustomName] = useState(
    subscription.customName || plan.customName || plan.type
  );
  const [rotation, setRotation] = useState(
    Option(subscription.rotation)
      .map((r) => r.enabled)
      .getOrElse(false)
  );
  const [editMode, setEditMode] = useState(false);
  const [rotationEvery, setRotationEvery] = useState(
    Option(subscription.rotation)
      .map((r) => r.rotationEvery)
      .getOrElse(744)
  );
  const [gracePeriod, setGracePeriod] = useState(
    Option(subscription.rotation)
      .map((r) => r.gracePeriod)
      .getOrElse(168)
  );
  const [error, setError] = useState({});
  const [activeTab, setActiveTab] = useState(
    plan.integrationProcess === 'Automatic' ? 'token' : 'apikey'
  );

  const [showAggregatePlan, setAggregatePlan] = useState(false);

  const { _id, integrationToken } = subscription;

  const { translateMethod, Translation } = useContext(I18nContext);

  let inputRef = React.createRef();
  let clipboard = React.createRef();

  useEffect(() => {
    if (editMode) {
      inputRef.current.focus();
    }
  }, [editMode]);

  useEffect(() => {
    if (rotationEvery < 0) {
      setError({ ...error, rotationEvery: "value can't be negative" });
    } else {
      delete error.rotationEvery;
      setError(error);
    }
  }, [rotationEvery]);

  useEffect(() => {
    if (gracePeriod < 0) {
      setError({ ...error, gracePeriod: "value can't be negative" });
    } else if (gracePeriod > rotationEvery) {
      setError({ ...error, gracePeriod: "value can't be bigger than rotationEvery" });
    } else {
      delete error.gracePeriod;
      setError(error);
    }
  }, [gracePeriod]);

  const handleCustomNameChange = () => {
    updateCustomName(customName.trim()).then(() => setEditMode(false));
  };

  const abort = () => {
    setRotation(
      Option(subscription.rotation)
        .map((rotation) => rotation.enabled)
        .getOrElse(false)
    );
    setSettingMode(false);
  };

  const abortCustomNameEdit = () => {
    setCustomName(subscription.customName || plan.type);
    setEditMode(false);
  };

  const handleChanges = () => {
    if (subscription.enabled && !Object.keys(error).length) {
      toggleRotation(rotationEvery, gracePeriod).then(() => setSettingMode(false));
    }
  };

  return (
    <div className="col-12 col-sm-6 col-md-4 mb-2">
      <div className="card">
        <div className="card-header" style={{ position: 'relative' }}>
          <div className="d-flex align-items-center justify-content-between">
            {!settingMode &&
              (!editMode ? (
                <>
                  <BeautifulTitle
                    title={customName}
                    style={{
                      wordBreak: 'break-all',
                      marginBlockEnd: '0',
                      whiteSpace: 'nowrap',
                      maxWidth: '85%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    className="plan-name">
                    {customName}
                  </BeautifulTitle>
                  <button
                    disabled={!subscription.enabled}
                    type="button"
                    className="btn btn-sm btn-access-negative ml-2"
                    onClick={() => setEditMode(true)}>
                    <i className="fas fa-pen cursor-pointer a-fake" />
                  </button>
                </>
              ) : (
                <div className="input-group">
                  <input
                    type="text"
                    className="form-control"
                    value={customName}
                    ref={inputRef}
                    onChange={(e) => setCustomName(e.target.value)}
                  />
                  <div className="input-group-append">
                    <span
                      className="input-group-text cursor-pointer"
                      onClick={handleCustomNameChange}>
                      <i className="fas fa-check accept" />
                    </span>
                    <span className="input-group-text cursor-pointer" onClick={abortCustomNameEdit}>
                      <i className="fas fa-times escape a-fake" />
                    </span>
                  </div>
                </div>
              ))}
            {settingMode ? (
              <h3>
                <Translation i18nkey="ApiKey rotation">
                  ApiKey rotation
                </Translation>
              </h3>
            ) : (
              <span
                className="badge badge-secondary"
                style={{ position: 'absolute', left: '1.25rem', bottom: '-8px' }}>
                {Option(plan.customName).getOrElse(formatPlanType(plan, translateMethod))}
              </span>
            )}
          </div>
        </div>
        <div className="card-body" style={{ margin: 0 }}>
          {!settingMode && (
            <div>
              <div className="d-flex justify-content-end mb-3">
                <div className="d-flex justify-content-around">
                  {!subscription.parent && (
                    <BeautifulTitle
                      title={translateMethod('Reset secret')}>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger ml-1"
                        disabled={!subscription.enabled}
                        onClick={regenerateSecret}>
                        <i className="fas fa-sync-alt" />
                      </button>
                    </BeautifulTitle>
                  )}
                  <Can I={read} a={stat} team={currentTeam}>
                    <BeautifulTitle
                      title={translateMethod('View usage statistics')}>
                      <Link to={statsLink} className="btn btn-sm btn-access-negative ml-1">
                        <i className="fas fa-chart-bar" />
                      </Link>
                    </BeautifulTitle>
                  </Can>
                  <BeautifulTitle
                    title={translateMethod('Copy to clipboard')}>
                    <button
                      type="button"
                      disabled={!subscription.enabled}
                      className="btn btn-sm btn-access-negative ml-1"
                      onClick={() => {
                        clipboard.current.select();
                        document.execCommand('Copy');
                        openInfoNotif(translateMethod('Credientials copied'));
                      }}>
                      <i className="fas fa-copy" />
                    </button>
                  </BeautifulTitle>
                  {!subscription.parent && !disableRotation && (
                    <BeautifulTitle
                      title={translateMethod('Setup rotation')}>
                      <button
                        type="button"
                        className="btn btn-sm btn-access-negative ml-1"
                        onClick={() => setSettingMode(true)}>
                        <i className="fas fa-history" />
                      </button>
                    </BeautifulTitle>
                  )}
                  <BeautifulTitle
                    title={translateMethod('Enable/Disable')}>
                    <button
                      type="button"
                      disabled={subscription.parent ? !subscription.parentUp : false}
                      className={classNames('btn btn-sm ml-1', {
                        'btn-outline-danger':
                          subscription.enabled &&
                          (subscription.parent ? subscription.parentUp : true),
                        'btn-outline-success':
                          !subscription.enabled &&
                          (subscription.parent ? subscription.parentUp : true),
                      })}
                      onClick={archiveApiKey}>
                      <i className="fas fa-power-off" />
                    </button>
                  </BeautifulTitle>
                  {subscription.parent && (
                    <BeautifulTitle title={translateMethod('team_apikey_for_api.make_unique')}>
                      <button
                        type="button"
                        className="btn btn-sm ml-1 btn-outline-danger"
                        onClick={makeUniqueApiKey}>
                        <i className="fas fa-share" />
                      </button>
                    </BeautifulTitle>
                  )}
                </div>
              </div>
              {subscription.apiKey && (
                <div className="row">
                  <ul className="nav nav-tabs flex-column flex-sm-row mb-2 col-12">
                    <li className="nav-item cursor-pointer">
                      <span
                        className={`nav-link ${activeTab === 'apikey' ? 'active' : ''}`}
                        onClick={() => setActiveTab('apikey')}>
                        <Translation i18nkey="ApiKey">
                          ApiKey
                        </Translation>
                      </span>
                    </li>
                    {!disableRotation && (
                      <li className="nav-item  cursor-pointer">
                        <span
                          className={`nav-link ${activeTab === 'token' ? 'active' : ''}`}
                          onClick={() => setActiveTab('token')}>
                          <Translation i18nkey="Integration token">
                            Integration token
                          </Translation>
                        </span>
                      </li>
                    )}
                  </ul>
                </div>
              )}
              {activeTab == 'apikey' && (
                <>
                  <div className="form-group">
                    <label htmlFor={`client-id-${_id}`} className="">
                      <Translation i18nkey="Client Id">
                        Client Id
                      </Translation>
                    </label>
                    <div className="">
                      <input
                        readOnly
                        disabled={!subscription.enabled}
                        className="form-control input-sm"
                        id={`client-id-${_id}`}
                        value={subscription.apiKey.clientId}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor={`client-secret-${_id}`} className="">
                      <Translation i18nkey="Client secret">
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
                        value={subscription.apiKey.clientSecret}
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
                </>
              )}
              {activeTab == 'token' && (
                <>
                  <div className="form-group">
                    <label htmlFor={`token-${_id}`} className="">
                      <Translation i18nkey="Integration token">
                        Integration token
                      </Translation>
                    </label>
                    <div className="">
                      <textarea
                        readOnly
                        rows="4"
                        className="form-control input-sm"
                        id={`token-${_id}`}
                        value={integrationToken}
                      />
                    </div>
                  </div>
                </>
              )}

              {subscription.children.length > 0 && (
                <>
                  {showAggregatePlan && (
                    <div className="text-center">
                      <h5 className="modal-title">Aggregate plans</h5>
                      <div>
                        {subscription.children.map((aggregate) => (
                          <div key={aggregate._id}>
                            <Link
                              to={`/${currentTeam._humanReadableId}/settings/apikeys/${aggregate._humanReadableId}`}>
                              {`${aggregate.apiName}/${aggregate.customName || aggregate.planType}`}
                            </Link>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <button
                    className={`btn btn-sm btn-outline-info mx-auto d-flex ${showAggregatePlan ? 'mt-3' : ''
                      }`}
                    onClick={() => setAggregatePlan(!showAggregatePlan)}>
                    {showAggregatePlan
                      ? translateMethod('team_apikey_for_api.hide_aggregate_sub')
                      : translateMethod('team_apikey_for_api.show_aggregate_sub')}
                  </button>
                </>
              )}
            </div>
          )}

          <input
            ref={clipboard}
            style={{ position: 'fixed', left: 0, top: -250 }}
            type="text"
            readOnly
            value={
              activeTab === 'apikey'
                ? subscription.apiKey.clientId + ':' + subscription.apiKey.clientSecret
                : integrationToken
            }
          />
          {settingMode && (
            <div className="d-flex flex-column flex-grow-0">
              {!plan.autoRotation && (
                <form>
                  <div className="d-flex flex-row align-items-center mb-3">
                    <div className="col-6">
                      <Translation i18nkey="Enabled">
                        Enabled
                      </Translation>
                      <Help
                        message={translateMethod(
                          'help.apikey.rotation',
                          false,
                          'If rotation is enabled then secret will be reseted every months'
                        )}
                      />
                    </div>
                    <div className="col-6 d-flex justify-content-end">
                      <SwitchButton
                        disabled={!subscription.enabled}
                        checked={rotation}
                        onSwitch={(v) => setRotation(v)}
                      />
                    </div>
                  </div>
                  <div className="d-flex flex-row align-items-center mb-3">
                    <div className="col-9">
                      <Translation i18nkey="Rotation Period">
                        Rotation Every
                      </Translation>
                      <Help
                        message={translateMethod(
                          'help.apikey.rotation.period',
                          false,
                          'Period after which the client secret will be automatically changed'
                        )}
                      />
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className={classNames('form-control col-3', {
                        'on-error': !!error.rotationEvery,
                      })}
                      value={rotationEvery}
                      disabled={!subscription.enabled || !rotation ? 'disabled' : undefined}
                      onChange={(e) => setRotationEvery(Number(e.target.value))}
                    />
                    {error.rotationEvery && (
                      <small className="invalid-input-info">{error.rotationEvery}</small>
                    )}
                  </div>
                  <div className="d-flex flex-row align-items-center mb-3">
                    <div className="col-9">
                      <Translation i18nkey="Grace Period">
                        Grace Period
                      </Translation>
                      <Help
                        message={translateMethod(
                          'help.apikey.grace.period',
                          false,
                          'Period during which the new client secret and the old are both active. The rotation period includes this period.'
                        )}
                      />
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className={classNames('form-control col-3', {
                        'on-error': !!error.gracePeriod,
                      })}
                      value={gracePeriod}
                      disabled={!subscription.enabled || !rotation ? 'disabled' : undefined}
                      onChange={(e) => setGracePeriod(Number(e.target.value))}
                    />
                    {error.gracePeriod && (
                      <small className="invalid-info">{error.gracePeriod}</small>
                    )}
                  </div>
                </form>
              )}
              <div className="d-flex justify-content-end">
                <button className="btn btn-outline-danger" onClick={abort}>
                  <Translation i18nkey="Back">
                    Back
                  </Translation>
                </button>
                <button
                  className="btn btn-outline-success ml-2"
                  disabled={
                    !subscription.enabled || Object.keys(error).length ? 'disabled' : undefined
                  }
                  onClick={handleChanges}>
                  <i className="fas fa-save mr-1"></i>
                  <Translation i18nkey="Save">
                    Save
                  </Translation>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Help = ({ message }) => {
  return (
    <BeautifulTitle placement="bottom" title={message}>
      <i className="ml-4 far fa-question-circle" />
    </BeautifulTitle>
  );
};
