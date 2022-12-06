import React, { useState, useEffect, useContext } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { toastr } from 'react-redux-toastr';
import classNames from 'classnames';
import sortBy from 'lodash/sortBy';
import { getApolloContext } from '@apollo/client';
import { Form, constraints, format, type } from '@maif/react-forms';

import * as Services from '../../../services';
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
import { I18nContext } from '../../../core';
import { ModalContext, useTeamBackOffice } from '../../../contexts';
import { IApi, IState, IStateContext, ISubscription, IUsagePlan } from '../../../types';

export const TeamApiKeysForApi = () => {
  const { currentTeam, connectedUser } = useSelector<IState, IStateContext>((state) => state.context);
  useTeamBackOffice(currentTeam);

  const [api, setApi] = useState<IApi>();
  const [apiTeam, setApiTeam] = useState();
  const [subscriptions, setSubscriptions] = useState<Array<ISubscription>>([]);
  const [searched, setSearched] = useState('');

  const [subscribedApis, setSubscribedApis] = useState([]);

  const location = useLocation();
  const params = useParams();
  const { client } = useContext(getApolloContext());
  const { translate, Translation } = useContext(I18nContext);
  const { confirm } = useContext(ModalContext);

  useEffect(() => {
    Promise.all([
      Services.getTeamVisibleApi(currentTeam._id, params.apiId, params.versionId),
      Services.getTeamSubscriptions(params.apiId, currentTeam._id, params.versionId),
    ])
      .then(([api, subscriptions]) => {
        if (!client) {
          return; //FIXME: handle case of client is not setted
        }
        Promise.all([
          client.query({
            query: Services.graphql.apisByIds,
            variables: { ids: [...new Set(subscriptions.map((s: any) => s.api))] },
          }),
          Services.team(api.team),
          Promise.resolve({ api, subscriptions }),
        ])
          .then(([{ data }, apiTeam, { api, subscriptions }]) => {
            setSubscribedApis(data.apis);
            setApiTeam(apiTeam);
            setSubscriptions(subscriptions);
            setApi(api);
          });
      })

  }, [location]);

  useEffect(() => {
    document.title = `${currentTeam.name} - ApiKeys`;
  }, []);

  const updateCustomName = (subscription: any, customName: any) => {
    return Services.updateSubscriptionCustomName(currentTeam, subscription, customName);
  };

  const archiveApiKey = (subscription: any) => {
    return Services.archiveApiKey(currentTeam._id, subscription._id, !subscription.enabled)
      .then(() => Services.getTeamSubscriptions(params.apiId, currentTeam._id, params.versionId))
      .then((subs) => setSubscriptions(subs));
  };

  const makeUniqueApiKey = (subscription: any) => {
    confirm({ message: translate('team_apikey_for_api.ask_for_make_unique') })
      .then((ok) => {
        if (ok)
          Services.makeUniqueApiKey(currentTeam._id, subscription._id)
            .then(() => Services.getTeamSubscriptions(params.apiId, currentTeam._id, params.versionId))
            .then((subs) => {
              toastr.success(translate('Success'), translate('team_apikey_for_api.ask_for_make_unique.success_message'));
              setSubscriptions(subs);
            });
      });
  };

  const toggleApiKeyRotation = (subscription: any, plan: any, enabled: any, rotationEvery: any, gracePeriod: any) => {
    if (plan.autoRotation) {
      return toastr.error(
        translate('Error'),
        translate('rotation.error.message')
      );
    }

    return Services.toggleApiKeyRotation(
      currentTeam._id,
      subscription._id,
      enabled,
      rotationEvery,
      gracePeriod
    )
      .then(() => Services.getTeamSubscriptions(params.apiId, currentTeam._id, params.versionId))
      .then((subs) => setSubscriptions(subs));
  };

  const regenerateApiKeySecret = (subscription: ISubscription) => {
    return confirm({ message: translate('reset.secret.confirm') })
      .then((ok) => {
        if (ok) {
          Services.regenerateApiKeySecret(currentTeam._id, subscription._id)
            .then(() => Services.getTeamSubscriptions(params.apiId, currentTeam._id, params.versionId))
            .then((subs) => setSubscriptions(subs))
            .then(() => toastr.success(translate('Success'), translate('secret reseted successfully')));
        }
      });
  };

  const currentPlan = (subscription: ISubscription): IUsagePlan => {
    return api!.possibleUsagePlans.find((p) => p._id === subscription.plan)!;
  };

  const showApiKey = CanIDoAction(connectedUser, read, apikey, currentTeam);

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
          return formatPlanType(plan, translate)
            .toLowerCase()
            .includes(search);
        }
      });

  const sorted = sortBy(filteredApiKeys, ['plan', 'customName', 'parent']);
  const sortedApiKeys = sorted
    .filter((f) => (f as any).parent)
    .reduce((acc, sub: any) => {
      return acc.find((a) => a._id === sub.parent)
        ? acc.map((a) => {
          if (a._id === sub.parent)
            a.children.push(sub);
          return a;
        })
        : [...acc, { ...sub, children: [] }];
    }, sorted.filter((f) => !(f as any).parent).map((sub: any) => ({ ...sub, children: [] })));

  return (<Can I={read} a={apikey} team={currentTeam} dispatchError>
    {api && apiTeam ? (<div className="row">
      <div className="col-12 d-flex align-items-center">
        <h1>
          <Translation i18nkey="Api keys for">Api keys for</Translation>
          &nbsp;
          <Link to={`/${(apiTeam as any)._humanReadableId}/${(api as any)._humanReadableId}/${(api as any).currentVersion}/description`} className="cursor-pointer underline-on-hover a-fake">
            {api.name}
          </Link>
        </h1>
      </div>
      <div className="col-12 mt-2 mb-4">
        <input type="text" className="form-control col-5" placeholder={translate('Search your apiKey...')} aria-label="Search your apikey" value={searched} onChange={(e) => setSearched(e.target.value)} />
      </div>

      <div className="col-12">
        <PaginatedComponent items={sortedApiKeys} count={5} formatter={(subscription) => {
          const plan = currentPlan(subscription);
          if (!plan) {
            return null;
          }
          return (
            <ApiKeyCard
              currentTeam={currentTeam}
              openInfoNotif={(message: any) => toastr.info(translate('Info'), message)}
              statsLink={`/${currentTeam._humanReadableId}/settings/apikeys/${params.apiId}/${params.versionId}/subscription/${subscription._id}/consumptions`}
              key={subscription._id}
              subscription={subscription}
              showApiKey={showApiKey}
              plan={plan}
              api={api}
              subscribedApis={subscribedApis}
              updateCustomName={(name: any) => updateCustomName(subscription, name)}
              archiveApiKey={() => archiveApiKey(subscription)}
              makeUniqueApiKey={() => makeUniqueApiKey(subscription)}
              toggleRotation={(enabled: any, rotationEvery: any, gracePeriod: any) => toggleApiKeyRotation(subscription, plan, enabled, rotationEvery, gracePeriod)}
              regenerateSecret={() => regenerateApiKeySecret(subscription)}
              disableRotation={api.visibility === 'AdminOnly' || plan.autoRotation} />);
        }} />
      </div>
    </div>) : null}
  </Can>);
}

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
  subscribedApis
}: any) => {
  const [hide, setHide] = useState(true);
  const [settingMode, setSettingMode] = useState(false);
  const [customName, setCustomName] = useState(
    subscription.customName || plan.customName || plan.type
  );

  const [editMode, setEditMode] = useState(false);

  const [activeTab, setActiveTab] = useState(
    plan.integrationProcess === 'Automatic' ? 'token' : 'apikey'
  );

  const [showAggregatePlan, setAggregatePlan] = useState(false);

  const { _id, integrationToken } = subscription;

  const { translate, Translation } = useContext(I18nContext);

  let inputRef = React.createRef<HTMLInputElement>();
  let clipboard = React.createRef<HTMLInputElement>();

  useEffect(() => {
    if (editMode) {
      (inputRef as any).current.focus();
    }
  }, [editMode]);

  const settingsSchema = {
    enabled: {
      type: type.bool,
      label: translate('Enabled'),
      help: translate('help.apikey.rotation'),
      disabled: plan.autoRotation,
    },
    rotationEvery: {
      type: type.number,
      label: translate('Rotation period'),
      help: translate('help.apikey.rotation.period'),
      disabled: ({
        rawValues
      }: any) => !rawValues.enabled,
      props: { steps: 1, min: 0 },
      constraints: [constraints.positive()],
    },
    gracePeriod: {
      type: type.number,
      label: translate('Grace period'),
      help: translate('help.apikey.grace.period'),
      disabled: ({
        rawValues
      }: any) => !rawValues.enabled,
      props: { steps: 1, min: 0 },
      constraints: [
        constraints.positive(),
        constraints.lessThan(
          constraints.ref<number>('rotationEvery'),
          translate('constraint.apikey.grace.period')
        ),
      ],
    },
  };

  const handleCustomNameChange = () => {
    updateCustomName(customName.trim()).then(() => setEditMode(false));
  };

  const abort = () => {
    setSettingMode(false);
  };

  const abortCustomNameEdit = () => {
    setCustomName(subscription.customName || plan.type);
    setEditMode(false);
  };

  const handleChanges = (rotation: any) => {
    if (subscription.enabled) {
      toggleRotation(rotation.enabled, rotation.rotationEvery, rotation.gracePeriod).then(() =>
        setSettingMode(false)
      );
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
                    className="plan-name"
                  >
                    {customName}
                  </BeautifulTitle>
                  <button
                    disabled={!subscription.enabled}
                    type="button"
                    className="btn btn-sm btn-access-negative ms-2"
                    onClick={() => setEditMode(true)}
                  >
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
                      onClick={handleCustomNameChange}
                    >
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
                <Translation i18nkey="ApiKey rotation">ApiKey rotation</Translation>
              </h3>
            ) : (
              <span
                className="badge bg-secondary"
                style={{ position: 'absolute', left: '1.25rem', bottom: '-8px' }}
              >
                {Option(plan.customName).getOrElse(formatPlanType(plan, translate))}
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
                    <BeautifulTitle title={translate('Reset secret')}>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger ms-1"
                        disabled={!subscription.enabled}
                        onClick={regenerateSecret}
                      >
                        <i className="fas fa-sync-alt" />
                      </button>
                    </BeautifulTitle>
                  )}
                  <Can I={read} a={stat} team={currentTeam}>
                    <BeautifulTitle title={translate('View usage statistics')}>
                      <Link to={statsLink} className="btn btn-sm btn-access-negative ms-1">
                        <i className="fas fa-chart-bar" />
                      </Link>
                    </BeautifulTitle>
                  </Can>
                  <BeautifulTitle title={translate('Copy to clipboard')}>
                    <button
                      type="button"
                      disabled={!subscription.enabled}
                      className="btn btn-sm btn-access-negative ms-1"
                      onClick={() => {
                        (clipboard as any).current.select();
                        document.execCommand('Copy');
                        openInfoNotif(translate('Credientials copied'));
                      }}
                    >
                      <i className="fas fa-copy" />
                    </button>
                  </BeautifulTitle>
                  {!subscription.parent && !disableRotation && (
                    <BeautifulTitle title={translate('Setup rotation')}>
                      <button
                        type="button"
                        className="btn btn-sm btn-access-negative ms-1"
                        onClick={() => setSettingMode(true)}
                      >
                        <i className="fas fa-history" />
                      </button>
                    </BeautifulTitle>
                  )}
                  {!subscription.parent && (
                    <BeautifulTitle title={translate('Enable/Disable')}>
                      <button
                        type="button"
                        disabled={subscription.parent ? !subscription.parentUp : false}
                        className={classNames('btn btn-sm ms-1', {
                          'btn-outline-danger':
                            subscription.enabled &&
                            (subscription.parent ? subscription.parentUp : true),
                          'btn-outline-success':
                            !subscription.enabled &&
                            (subscription.parent ? subscription.parentUp : true),
                        })}
                        onClick={archiveApiKey}
                      >
                        <i className="fas fa-power-off" />
                      </button>
                    </BeautifulTitle>
                  )}
                  {subscription.parent && (
                    <BeautifulTitle title={translate('team_apikey_for_api.make_unique')}>
                      <button
                        type="button"
                        className="btn btn-sm ms-1 btn-outline-danger"
                        onClick={makeUniqueApiKey}
                      >
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
                        onClick={() => setActiveTab('apikey')}
                      >
                        <Translation i18nkey="ApiKey">ApiKey</Translation>
                      </span>
                    </li>
                    {!disableRotation && (
                      <li className="nav-item  cursor-pointer">
                        <span
                          className={`nav-link ${activeTab === 'token' ? 'active' : ''}`}
                          onClick={() => setActiveTab('token')}
                        >
                          <Translation i18nkey="Integration token">Integration token</Translation>
                        </span>
                      </li>
                    )}
                  </ul>
                </div>
              )}
              {activeTab == 'apikey' && (
                <>
                  <div className="mb-3">
                    <label htmlFor={`client-id-${_id}`} className="">
                      <Translation i18nkey="Client Id">Client Id</Translation>
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
                  <div className="mb-3">
                    <label htmlFor={`client-secret-${_id}`} className="">
                      <Translation i18nkey="Client secret">Client secret</Translation>
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
                          id={`client-secret-addon-${_id}`}
                        >
                          {hide ? <i className="fas fa-eye" /> : <i className="fas fa-eye-slash" />}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}
              {activeTab == 'token' && (
                <>
                  <div className="mb-3">
                    <label htmlFor={`token-${_id}`} className="">
                      <Translation i18nkey="Integration token">Integration token</Translation>
                    </label>
                    <div className="">
                      <textarea
                        readOnly
                        rows={4}
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
                        {subscription.children.map((aggregate: any) => {
                          const api = subscribedApis.find((a: any) => a._id === aggregate.api);
                          return (
                            <div key={aggregate._id}>
                              <Link
                                to={`/${currentTeam._humanReadableId}/settings/apikeys/${aggregate._humanReadableId}/${api.currentVersion}`}
                              >
                                {`${aggregate.apiName}/${aggregate.customName || aggregate.planType
                                  }`}
                              </Link>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <button
                    className={`btn btn-sm btn-outline-info mx-auto d-flex ${showAggregatePlan ? 'mt-3' : ''
                      }`}
                    onClick={() => setAggregatePlan(!showAggregatePlan)}
                  >
                    {showAggregatePlan
                      ? translate('team_apikey_for_api.hide_aggregate_sub')
                      : translate('team_apikey_for_api.show_aggregate_sub')}
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
                <Form
                  schema={settingsSchema}
                  onSubmit={handleChanges}
                  value={Option(subscription.rotation).getOrElse({
                    enabled: false,
                    rotationEvery: 744,
                    gracePeriod: 168,
                  })}
                  footer={({ valid }) => {
                    return (
                      <div className="d-flex justify-content-end mt-3">
                        <button className="btn btn-outline-danger" onClick={abort}>
                          <Translation i18nkey="Back">Back</Translation>
                        </button>
                        <button className="btn btn-outline-success ms-2" onClick={valid}>
                          <i className="fas fa-save me-1"></i>
                          <Translation i18nkey="Save">Save</Translation>
                        </button>
                      </div>
                    );
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Help = ({
  message
}: any) => {
  return (
    <BeautifulTitle placement="bottom" title={message}>
      <i className="ms-4 far fa-question-circle" />
    </BeautifulTitle>
  );
};
