import React, { useState, useEffect, useContext } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
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
import { useTeamBackOffice } from '../../../contexts';

export const TeamApiKeysForApi = () => {
  const { currentTeam, connectedUser } = useSelector((state) => (state as any).context);
  useTeamBackOffice(currentTeam);

  const [api, setApi] = useState({ name: '--', possibleUsagePlans: [] });
  const [apiTeam, setApiTeam] = useState();
  const [subscriptions, setSubscriptions] = useState([]);
  const [searched, setSearched] = useState('');

  const [subscribedApis, setSubscribedApis] = useState([]);

  const location = useLocation();
  const params = useParams();
  const { client } = useContext(getApolloContext());
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, Translation } = useContext(I18nContext);

  useEffect(() => {
    Promise.all([
      Services.getTeamVisibleApi(currentTeam._id, params.apiId, params.versionId),
      Services.getTeamSubscriptions(params.apiId, currentTeam._id, params.versionId),
    ])
      .then(([api, subscriptions]) =>
        Promise.all([
          // @ts-expect-error TS(2532): Object is possibly 'undefined'.
          client.query({
            query: Services.graphql.apisByIds,
            variables: { ids: [...new Set(subscriptions.map((s: any) => s.api))] },
          }),
          Services.team(api.team),
          Promise.resolve({ api, subscriptions }),
        ])
      )
      .then(([{ data }, apiTeam, { api, subscriptions }]) => {
        setSubscribedApis(data.apis);
        setApiTeam(apiTeam);
        setSubscriptions(subscriptions);
        setApi(api);
      });
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
    (window.confirm(translateMethod('team_apikey_for_api.ask_for_make_unique')) as any).then((ok: any) => {
    if (ok)
        Services.makeUniqueApiKey(currentTeam._id, subscription._id)
            .then(() => Services.getTeamSubscriptions(params.apiId, currentTeam._id, params.versionId))
            .then((subs) => {
            toastr.success('team_apikey_for_api.ask_for_make_unique.success_message');
            setSubscriptions(subs);
        });
});
  };

  const toggleApiKeyRotation = (subscription: any, plan: any, enabled: any, rotationEvery: any, gracePeriod: any) => {
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
      currentTeam._id,
      subscription._id,
      enabled,
      rotationEvery,
      gracePeriod
    )
      .then(() => Services.getTeamSubscriptions(params.apiId, currentTeam._id, params.versionId))
      .then((subs) => setSubscriptions(subs));
  };

  const regenerateApiKeySecret = (subscription: any) => {
    return (window
    .confirm(translateMethod('reset.secret.confirm', false, 'Are you sure you want to reset this secret ?')) as any).then((ok: any) => {
    if (ok) {
        Services.regenerateApiKeySecret(currentTeam._id, subscription._id)
            .then(() => Services.getTeamSubscriptions(params.apiId, currentTeam._id, params.versionId))
            .then((subs) => setSubscriptions(subs))
            .then(() => toastr.success('secret reseted successfully'));
    }
});
  };

  const currentPlan = (subscription: any) => {
    return api.possibleUsagePlans.find((p) => (p as any)._id === subscription.plan);
  };

  // @ts-expect-error TS(2554): Expected 8 arguments, but got 4.
  const showApiKey = CanIDoAction(connectedUser, read, apikey, currentTeam);

  const search = searched.trim().toLowerCase();
  const filteredApiKeys =
    search === ''
      ? subscriptions
      : subscriptions.filter((subs) => {
          const plan = currentPlan(subs);

          if (plan && (plan as any).customName && (plan as any).customName.toLowerCase().includes(search)) {
            return true;
          } else if ((subs as any).customName && (subs as any).customName.toLowerCase().includes(search)) {
            return true;
          } else {
            return formatPlanType(currentPlan(subs), translateMethod)
              .toLowerCase()
              .includes(search);
          }
        });

  const sorted = sortBy(filteredApiKeys, ['plan', 'customName', 'parent']);
  const sortedApiKeys = sorted
    .filter((f) => (f as any).parent)
    .reduce((acc, sub) => {
    // @ts-expect-error TS(2339): Property 'parent' does not exist on type 'never'.
    return acc.find((a) => a._id === sub.parent)
        ? acc.map((a) => {
            // @ts-expect-error TS(2339): Property 'parent' does not exist on type 'never'.
            if (a._id === sub.parent)
                a.children.push(sub);
            return a;
        })
        : // @ts-expect-error TS(2698): Spread types may only be created from object types... Remove this comment to see the full error message
          [...acc, { ...sub, children: [] }];
// @ts-expect-error TS(2698): Spread types may only be created from object types... Remove this comment to see the full error message
}, sorted.filter((f) => !(f as any).parent).map((sub) => ({ ...sub, children: [] })));
        // @ts-expect-error TS(2304): Cannot find name 'acc'.
        return acc.find((a) => a._id === (sub as any).parent)
    ? // @ts-expect-error TS(2304): Cannot find name 'acc'.
      acc.map((a) => {
        // @ts-expect-error TS(2304): Cannot find name 'sub'.
        if (a._id === sub.parent)
            // @ts-expect-error TS(2304): Cannot find name 'sub'.
            a.children.push(sub);
        return a;
    })
    : // @ts-expect-error TS(2304): Cannot find name 'acc'.
      [...acc, { ...sub, children: [] }];a._id === (sub as any).parent) a.children.push(sub);
              // @ts-expect-error TS(2304): Cannot find name 'a'.
              return a;
            })
          // @ts-expect-error TS(2304): Cannot find name 'acc'.
          : [...acc, { ...sub, children: [] }];
      },
      // @ts-expect-error TS(2304): Cannot find name 'sorted'.
      sorted.filter((f) => !f.parent).map((sub) => ({ ...sub, children: [] }))
    );

  return (<Can I={read} a={apikey} team={currentTeam} dispatchError>
      {api && apiTeam ? (<div className="row">
          <div className="col-12 d-flex align-items-center">
            <h1>
              <Translation i18nkey="Api keys for">Api keys for</Translation>
              &nbsp;
              <Link to={`/${(apiTeam as any)._humanReadableId}/${(api as any)._humanReadableId}/${(api as any).currentVersion}`} className="cursor-pointer underline-on-hover a-fake">
                {api.name}
              </Link>
            </h1>
          </div>
          <div className="col-12 mt-2 mb-4">
            <input type="text" className="form-control col-5" placeholder={translateMethod('Search your apiKey...')} aria-label="Search your apikey" value={searched} onChange={(e) => setSearched(e.target.value)}/>
          </div>

          <div className="col-12">
            <PaginatedComponent items={sortedApiKeys} count={5} formatter={(subscription) => {
            const plan = currentPlan(subscription);
            if (!plan) {
                return null;
            }
            return (<ApiKeyCard currentTeam={currentTeam} openInfoNotif={(message: any) => toastr.info(message)} statsLink={`/${currentTeam._humanReadableId}/settings/apikeys/${params.apiId}/${params.versionId}/subscription/${subscription._id}/consumptions`} key={subscription._id} subscription={subscription} showApiKey={showApiKey} plan={plan} api={api} subscribedApis={subscribedApis} updateCustomName={(name: any) => updateCustomName(subscription, name)} archiveApiKey={() => archiveApiKey(subscription)} makeUniqueApiKey={() => makeUniqueApiKey(subscription)} toggleRotation={(enabled: any, rotationEvery: any, gracePeriod: any) => toggleApiKeyRotation(subscription, plan, enabled, rotationEvery, gracePeriod)} regenerateSecret={() => regenerateApiKeySecret(subscription)} disableRotation={api.visibility === 'AdminOnly' || plan.autoRotation}/>);
        }}/>
          </div>
        </div>) : null}
    </Can>);

                return (<ApiKeyCard currentTeam={currentTeam} openInfoNotif={(message: any) => toastr.info(message)} statsLink={`/${currentTeam._humanReadableId}/settings/apikeys/${params.apiId}/${params.versionId}/subscription/${subscription._id}/consumptions`} key={subscription._id} subscription={subscription} showApiKey={showApiKey} plan={plan} api={api} subscribedApis={subscribedApis} updateCustomName={(name: any) => updateCustomName(subscription, name)} archiveApiKey={() => archiveApiKey(subscription)} makeUniqueApiKey={() => makeUniqueApiKey(subscription)} toggleRotation={(enabled: any, rotationEvery: any, gracePeriod: any) => toggleApiKeyRotation(subscription, plan, enabled, rotationEvery, gracePeriod)} regenerateSecret={() => regenerateApiKeySecret(subscription)} disableRotation={(api as any).visibility === 'AdminOnly' || (plan as any).autoRotation}/>);
              }}
            />
          // @ts-expect-error TS(2304): Cannot find name 'div'.
          </div>
        // @ts-expect-error TS(2304): Cannot find name 'div'.
        </div>
      ) : null}
    </Can>
  );
};

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

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, Translation } = useContext(I18nContext);

  let inputRef = React.createRef();
  let clipboard = React.createRef();

  useEffect(() => {
    if (editMode) {
      (inputRef as any).current.focus();
    }
  }, [editMode]);

  const settingsSchema = {
    enabled: {
      type: type.bool,
      label: translateMethod('Enabled'),
      help: translateMethod('help.apikey.rotation'),
      disabled: plan.autoRotation,
    },
    rotationEvery: {
      type: type.number,
      label: translateMethod('Rotation period'),
      help: translateMethod('help.apikey.rotation.period'),
      disabled: ({
        rawValues
      }: any) => !rawValues.enabled,
      props: { steps: 1, min: 0 },
      constraints: [constraints.positive()],
    },
    gracePeriod: {
      type: type.number,
      label: translateMethod('Grace period'),
      help: translateMethod('help.apikey.grace.period'),
      disabled: ({
        rawValues
      }: any) => !rawValues.enabled,
      props: { steps: 1, min: 0 },
      constraints: [
        constraints.positive(),
        constraints.lessThan(
          // @ts-expect-error TS(2345): Argument of type 'Reference<unknown>' is not assig... Remove this comment to see the full error message
          constraints.ref('rotationEvery'),
          translateMethod('constraint.apikey.grace.period')
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
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="col-12 col-sm-6 col-md-4 mb-2">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="card">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="card-header" style={{ position: 'relative' }}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="d-flex align-items-center justify-content-between">
            {!settingMode &&
              (!editMode ? (
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <button
                    disabled={!subscription.enabled}
                    type="button"
                    className="btn btn-sm btn-access-negative ms-2"
                    onClick={() => setEditMode(true)}
                  >
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <i className="fas fa-pen cursor-pointer a-fake" />
                  </button>
                </>
              ) : (
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <div className="input-group">
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <input
                    type="text"
                    className="form-control"
                    value={customName}
                    // @ts-expect-error TS(2322): Type 'RefObject<unknown>' is not assignable to typ... Remove this comment to see the full error message
                    ref={inputRef}
                    onChange={(e) => setCustomName(e.target.value)}
                  />
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <div className="input-group-append">
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span
                      className="input-group-text cursor-pointer"
                      onClick={handleCustomNameChange}
                    >
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <i className="fas fa-check accept" />
                    </span>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span className="input-group-text cursor-pointer" onClick={abortCustomNameEdit}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <i className="fas fa-times escape a-fake" />
                    </span>
                  </div>
                </div>
              ))}
            {settingMode ? (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <h3>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Translation i18nkey="ApiKey rotation">ApiKey rotation</Translation>
              </h3>
            ) : (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <span
                className="badge bg-secondary"
                style={{ position: 'absolute', left: '1.25rem', bottom: '-8px' }}
              >
                {Option(plan.customName).getOrElse(formatPlanType(plan, translateMethod))}
              </span>
            )}
          </div>
        </div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="card-body" style={{ margin: 0 }}>
          {!settingMode && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <div>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className="d-flex justify-content-end mb-3">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <div className="d-flex justify-content-around">
                  {!subscription.parent && (
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <BeautifulTitle title={translateMethod('Reset secret')}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger ms-1"
                        disabled={!subscription.enabled}
                        onClick={regenerateSecret}
                      >
                        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <i className="fas fa-sync-alt" />
                      </button>
                    </BeautifulTitle>
                  )}
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <Can I={read} a={stat} team={currentTeam}>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <BeautifulTitle title={translateMethod('View usage statistics')}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <Link to={statsLink} className="btn btn-sm btn-access-negative ms-1">
                        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <i className="fas fa-chart-bar" />
                      </Link>
                    </BeautifulTitle>
                  </Can>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <BeautifulTitle title={translateMethod('Copy to clipboard')}>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <button
                      type="button"
                      disabled={!subscription.enabled}
                      className="btn btn-sm btn-access-negative ms-1"
                      onClick={() => {
                        (clipboard as any).current.select();
                        document.execCommand('Copy');
                        openInfoNotif(translateMethod('Credientials copied'));
                      }}
                    >
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <i className="fas fa-copy" />
                    </button>
                  </BeautifulTitle>
                  {!subscription.parent && !disableRotation && (
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <BeautifulTitle title={translateMethod('Setup rotation')}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <button
                        type="button"
                        className="btn btn-sm btn-access-negative ms-1"
                        onClick={() => setSettingMode(true)}
                      >
                        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <i className="fas fa-history" />
                      </button>
                    </BeautifulTitle>
                  )}
                  {!subscription.parent && (
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <BeautifulTitle title={translateMethod('Enable/Disable')}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
                        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <i className="fas fa-power-off" />
                      </button>
                    </BeautifulTitle>
                  )}
                  {subscription.parent && (
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <BeautifulTitle title={translateMethod('team_apikey_for_api.make_unique')}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <button
                        type="button"
                        className="btn btn-sm ms-1 btn-outline-danger"
                        onClick={makeUniqueApiKey}
                      >
                        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <i className="fas fa-share" />
                      </button>
                    </BeautifulTitle>
                  )}
                </div>
              </div>
              {subscription.apiKey && (
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <div className="row">
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <ul className="nav nav-tabs flex-column flex-sm-row mb-2 col-12">
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <li className="nav-item cursor-pointer">
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <span
                        className={`nav-link ${activeTab === 'apikey' ? 'active' : ''}`}
                        onClick={() => setActiveTab('apikey')}
                      >
                        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <Translation i18nkey="ApiKey">ApiKey</Translation>
                      </span>
                    </li>
                    {!disableRotation && (
                      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                      <li className="nav-item  cursor-pointer">
                        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <span
                          className={`nav-link ${activeTab === 'token' ? 'active' : ''}`}
                          onClick={() => setActiveTab('token')}
                        >
                          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                          <Translation i18nkey="Integration token">Integration token</Translation>
                        </span>
                      </li>
                    )}
                  </ul>
                </div>
              )}
              {activeTab == 'apikey' && (
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <div className="mb-3">
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <label htmlFor={`client-id-${_id}`} className="">
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <Translation i18nkey="Client Id">Client Id</Translation>
                    </label>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <div className="">
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <input
                        readOnly
                        disabled={!subscription.enabled}
                        className="form-control input-sm"
                        id={`client-id-${_id}`}
                        value={subscription.apiKey.clientId}
                      />
                    </div>
                  </div>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <div className="mb-3">
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <label htmlFor={`client-secret-${_id}`} className="">
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <Translation i18nkey="Client secret">Client secret</Translation>
                    </label>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <div className="input-group">
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <input
                        readOnly
                        disabled={!subscription.enabled}
                        type={hide ? 'password' : ''}
                        className="form-control input-sm"
                        id={`client-secret-${_id}`}
                        value={subscription.apiKey.clientSecret}
                        aria-describedby={`client-secret-addon-${_id}`}
                      />
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <div className="input-group-append">
                        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
                          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                          {hide ? <i className="fas fa-eye" /> : <i className="fas fa-eye-slash" />}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}
              {activeTab == 'token' && (
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <div className="mb-3">
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <label htmlFor={`token-${_id}`} className="">
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <Translation i18nkey="Integration token">Integration token</Translation>
                    </label>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <div className="">
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <textarea
                        readOnly
                        // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'number'.
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
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <>
                  {showAggregatePlan && (
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <div className="text-center">
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <h5 className="modal-title">Aggregate plans</h5>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <div>
                        {subscription.children.map((aggregate: any) => {
                          const api = subscribedApis.find((a: any) => a._id === aggregate.api);
                          return (
                            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                            <div key={aggregate._id}>
                              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                              <Link
                                to={`/${currentTeam._humanReadableId}/settings/apikeys/${aggregate._humanReadableId}/${api.currentVersion}`}
                              >
                                {`${aggregate.apiName}/${
                                  aggregate.customName || aggregate.planType
                                }`}
                              </Link>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <button
                    className={`btn btn-sm btn-outline-info mx-auto d-flex ${
                      showAggregatePlan ? 'mt-3' : ''
                    }`}
                    onClick={() => setAggregatePlan(!showAggregatePlan)}
                  >
                    {showAggregatePlan
                      ? translateMethod('team_apikey_for_api.hide_aggregate_sub')
                      : translateMethod('team_apikey_for_api.show_aggregate_sub')}
                  </button>
                </>
              )}
            </div>
          )}

          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <input
            // @ts-expect-error TS(2322): Type 'RefObject<unknown>' is not assignable to typ... Remove this comment to see the full error message
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
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <div className="d-flex flex-column flex-grow-0">
              {!plan.autoRotation && (
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
                      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                      <div className="d-flex justify-content-end mt-3">
                        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <button className="btn btn-outline-danger" onClick={abort}>
                          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                          <Translation i18nkey="Back">Back</Translation>
                        </button>
                        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <button className="btn btn-outline-success ms-2" onClick={valid}>
                          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                          <i className="fas fa-save me-1"></i>
                          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <BeautifulTitle placement="bottom" title={message}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <i className="ms-4 far fa-question-circle" />
    </BeautifulTitle>
  );
};
