import React, { Component, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { connect } from 'react-redux';
import { toastr } from 'react-redux-toastr';
import Pagination from 'react-paginate';
import classNames from 'classnames'

import * as Services from '../../../services';
import { TeamBackOffice } from '..';
import { formatPlanType, Can, read, apikey, isUserIsTeamAdmin, CanIDoAction, PaginatedComponent } from '../../utils';
import { SwitchButton } from '../../inputs'
import { t, Translation } from "../../../locales";


class TeamApiKeysForApiComponent extends Component {
  state = {
    loading: true,
    api: { name: '--', possibleUsagePlans: [] },
    apiTeam: null,
    subscriptions: [],
    searched: '',
    selectedPage: 0,
    offset: 0,
    pageNumber: 5
  };

  componentDidMount() {
    Promise.all([
      Services.getTeamVisibleApi(this.props.currentTeam._id, this.props.match.params.apiId),
      Services.getTeamSubscriptions(this.props.match.params.apiId, this.props.currentTeam._id)
    ])
      .then(([api, subscriptions]) => Services.team(api.team)
        .then(apiTeam => this.setState({ api, apiTeam, subscriptions, loading: false }))
      );
  }

  updateCustomName = (subscription, customName) => {
    return Services.updateSubscriptionCustomName(this.props.currentTeam, subscription, customName);
  };

  deleteApiKey = (subscription) => {
    window.confirm(t('delete.apikey.confirm', thsi.prosp.currentLanguage, 'Are you sure to delete this apikey ?'))
      .then(ok => {
        if (ok) {
          Services.deleteApiKey(this.props.currentTeam._id, subscription._id)
            .then(() => Services.getTeamSubscriptions(this.props.match.params.apiId, this.props.currentTeam._id))
            .then(subscriptions => this.setState({ subscriptions }))
        }
      });
  };

  archiveApiKey = (subscription) => {
    Services.archiveApiKey(this.props.currentTeam._id, subscription._id, !subscription.enabled)
      .then(() => Services.getTeamSubscriptions(this.props.match.params.apiId, this.props.currentTeam._id))
      .then(subscriptions => this.setState({ subscriptions }))
  }

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
            return formatPlanType(this.currentPlan(subs)).toLowerCase().includes(searched);
          }
        });

    const paginateApiKeys = filteredApiKeys.slice(
      this.state.offset,
      this.state.offset + this.state.pageNumber
    );

    return (
      <TeamBackOffice tab="ApiKeys" apiId={this.props.match.params.apiId} isLoading={!this.state.apiTeam}>
        <Can I={read} a={apikey} team={this.props.currentTeam} dispatchError>
          {this.state.apiTeam && <div className="row">
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
                placeholder={t("Search your apiKey...", this.props.currentLanguage)}
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
                      archiveApiKey={() => this.archiveApiKey(subscription)} />
                  );
                }}
              />
            </div>

          </div>}
        </Can>
      </TeamBackOffice>
    );
  };
}

const mapStateToProps = state => ({
  ...state.context,
});

export const TeamApiKeysForApi = connect(
  mapStateToProps
)(TeamApiKeysForApiComponent);


const ApiKeyCard = ({ subscription, plan, updateCustomName, openInfoNotif, statsLink, deleteApiKey, archiveApiKey, currentLanguage }) => {
  //todo: maybe use showApikey props somewhere
  const [hide, setHide] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [customName, setCustomName] = useState(subscription.customName || plan.type);
  const { _id, apiKey } = subscription;
  let inputRef = React.createRef();
  let clipboard = React.createRef();

  useEffect(() => {
    if (editMode) {
      inputRef.current.focus();
    }
  }, [editMode]);

  const handleCustomNameChange = () => {
    updateCustomName(customName.trim())
      .then(() => setEditMode(false));
  };

  const abort = () => {
    setCustomName(subscription.customName || plan.type);
    setEditMode(false);
  };

  return (
    <div className="col-12 col-sm-6 col-md-4 mb-2">
      <div className="card">
        <div className="card-header">
          <div className="d-flex align-items-center justify-content-between">
            {!editMode && <><h3 style={{ wordBreak: 'break-all', marginBlockEnd: '0' }}>{customName}</h3>
              <button disabled={!subscription.enabled} type="button" className="btn btn-sm btn-access-negative ml-2" onClick={() => setEditMode(true)} ><i className="fas fa-pen cursor-pointer a-fake" /></button></>}
            {editMode && <div className="input-group"><input type="text" className="form-control" value={customName} ref={inputRef} onChange={e => setCustomName(e.target.value)} />
              <div className="input-group-append">
                <span className="input-group-text cursor-pointer" onClick={handleCustomNameChange}><i className="fas fa-check accept" /></span>
                <span className="input-group-text cursor-pointer" onClick={() => abort()}><i className="fas fa-times escape a-fake" /></span>
              </div>
            </div>
            }
          </div>
        </div>
        <div className="card-body">
          <div>
            <div className="d-flex justify-content-between mb-3">
              <Link
                to={statsLink}
                className="btn btn-sm btn-access-negative">
                <i className="fas fa-chart-bar" />
              </Link>
              <span className="badge badge-secondary">{formatPlanType(plan)}</span>
            </div>
            <div className="form-group">
              <label htmlFor={`client-id-${_id}`} className="">
                <Translation i18nkey="Client Id" language={currentLanguage}>
                  Client Id
                </Translation>
              </label>
              <div className="">
                <input disabled={!subscription.enabled} className="form-control input-sm" id={`client-id-${_id}`} disabled value={apiKey.clientId} />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor={`client-secret-${_id}`} className="">
                <Translation i18nkey="Client secret" language={currentLanguage}>
                  Client secret
                </Translation>
              </label>
              <div className="input-group">
                <input disabled={!subscription.enabled} type={hide ? 'password' : ''} className="form-control input-sm" id={`client-secret-${_id}`} disabled value={apiKey.clientSecret} aria-describedby={`client-secret-addon-${_id}`} />
                <div className="input-group-append">
                  <span
                    onClick={() => { if (subscription.enabled) { setHide(!hide) } }}
                    className={classNames("input-group-text", {
                      'cursor-pointer': subscription.enabled,
                      'cursor-forbidden': !subscription.enabled
                    })}
                    id={`client-secret-addon-${_id}`}>{hide ? <i className="fas fa-eye" /> :
                      <i className="fas fa-eye-slash" />}
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

            <div className="d-flex justify-content-between">
              <SwitchButton
                onSwitch={archiveApiKey}
                checked={subscription.enabled}
                large
              />
              <button type="button" disabled={!subscription.enabled} className="btn btn-sm btn-access-negative mb-1 float-right"
                onClick={() => {
                  clipboard.current.select();
                  document.execCommand('Copy');
                  openInfoNotif(t('Credientials copied', currentLanguage));
                }}><i className="fas fa-copy" />
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};