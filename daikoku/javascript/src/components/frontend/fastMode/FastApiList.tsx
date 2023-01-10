import React, {useContext, useState} from "react";
import {I18nContext} from "../../../contexts/i18n-context";
import {IFastApi, IFastApiSubscription, IFastPlan, ITeamSimple} from "../../../types";
import {BeautifulTitle, formatCurrency, formatPlanType, getCurrencySymbol, Option} from "../../utils";
import * as Services from "../../../services";
import Select from "react-select";
import Pagination from "react-paginate";
import classNames from "classnames";
import find from "lodash/find";
import {currencies} from "../../../services/currencies";
import {ExpertApiCard} from "./FastApiCard";

type ExpertApiListProps = {
  teamList: Array<ITeamSimple>
  team: ITeamSimple
  apiWithAuthorizations: Array<IFastApi>
  setTeam: Function
  nbOfApis: number
  nb:number
  page: number
  setNbOfApis: Function
  input: string
  setInput: Function
  handlePageClick: Function
  planResearch: string

}
const currency = (plan: any) => {
  const cur = find(currencies, (c) => c.code === plan.currency.code);
  return `${cur?.name}(${cur?.symbol})`;
};
const Currency = ({
                   plan
                 }: any) => {
  const cur = find(currencies, (c) => c.code === plan.currency.code);
  return (
    <span>
      {' '}
      {cur?.name}({cur?.symbol})
    </span>
  );
};
export const ExpertApiList = (props: ExpertApiListProps) => {
  const {translate} = useContext(I18nContext);
  const [planInfo, setPlanInfo] = useState<IFastPlan>();
  const [subscription, setSubscription] = useState<IFastApiSubscription | undefined>()
  const [apiKeyValue, setApiKeyValue] = useState<string>();
  const [isPlan, setIsPlan] = useState<boolean | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<string>('apikey');
  const [hide, setHide] = useState(true);

  const renderPricing = (type: string) => {
    let pricing = translate('Free');
    const req = translate('req.');

    const month = translate('month');
    if(type === 'QuotasWithoutLimits') {
      pricing = `${formatCurrency(planInfo!.costPerMonth)} ${getCurrencySymbol(
        planInfo!.currency
      )}/${month} + ${formatCurrency(planInfo!.costPerAdditionalRequest)} ${getCurrencySymbol(
        planInfo!.currency
      )}/${req}`
    } else if (type === 'PayPerUse') {
      pricing = `${formatCurrency(planInfo!.costPerRequest)} ${getCurrencySymbol(
        planInfo!.currency
      )}/${req}`;
    } else if(planInfo!.costPerMonth) {
      pricing = `${formatCurrency(planInfo!.costPerMonth)} ${getCurrencySymbol(
        planInfo!.currency
      )}/${month}`;
    }
    return pricing;
  }
  const renderPlanInfo = (type: string) => {
    return(
      <span>
        {type === 'FreeWithoutQuotas' &&
            <>
              {translate('free.without.quotas.desc')}
            </>
        } {type === 'FreeWithQuotas' &&
          <>
            {translate({key: 'free.with.quotas.desc', replacements: [planInfo!.maxPerMonth!.toString()]})}
          </>
      } {type === 'QuotasWithLimits' &&
          <>
            {translate({key: 'quotas.with.limits.desc', replacements: [planInfo!.costPerMonth!.toString(), currency(planInfo), planInfo!.maxPerMonth!.toString()]})}
            You'll pay {planInfo!.costPerMonth}
            <Currency plan={planInfo} /> and you'll have {planInfo!.maxPerMonth} authorized requests
            per month
          </>
      } {type === 'QuotasWithoutLimits' &&
          <>
            {translate({key: 'quotas.without.limits.desc', replacements:
                [planInfo!.costPerMonth!.toString(), currency(planInfo), planInfo!.maxPerMonth!.toString(),planInfo!.costPerAdditionalRequest!.toString(), currency(planInfo)]
            })}
            You'll pay {planInfo!.costPerMonth}
            <Currency plan={planInfo} /> for {planInfo!.maxPerMonth} authorized requests per month and
            you'll be charged {planInfo!.costPerAdditionalRequest}
            <Currency plan={planInfo} /> per additional request
          </>
      } {type === 'PayPerUse' &&
          <>
            {translate({key: 'pay.per.use.desc.default', replacements:
                [planInfo!.costPerMonth!.toString(), currency(planInfo), planInfo!.costPerRequest!.toString(), currency(planInfo)]
            })}
            {planInfo!.costPerMonth === 0.0 &&
                <>
                  You'll pay {planInfo!.costPerMonth}
                  <Currency plan={planInfo} /> per month and you'll be charged{' '}
                  {planInfo!.costPerRequest}
                  <Currency plan={planInfo} /> per request
                </>
            }
            {planInfo!.costPerMonth !== 0.0 &&
                <>
                  You'll be charged {planInfo!.costPerRequest}
                  <Currency plan={planInfo} /> per request
                </>
            } </>
      }
      </span>
    )
  }

  function showPlan(plan: IFastPlan) {
    if(plan._id == planInfo?._id && isPlan) {
      setIsPlan(undefined)
    } else {
      setIsPlan(true)
      setPlanInfo(plan)
    }
  }
  function showApiKey(apiId: string, teamId: string, version: string, planInfo: IFastPlan) {
    if(planInfo._id == apiKeyValue && isPlan == false) {
      setIsPlan(undefined)

    } else {
      setIsPlan(false)
      setPlanInfo(planInfo)
      setApiKeyValue(planInfo._id)
      const tmp = Services.getTeamSubscriptionsWithPlan(apiId, teamId,version,planInfo._id)
      tmp.then((apikey) => setSubscription(apikey[0]))
    }
  }

  return (
    <div className="container">
      <div className="row" style={{position: "relative"}}>
        <div className="col-9" style={{height: 600, overflow: "scroll"}}>
          <div className="col-3 mb-2">
            <Select
              name="nb-api-selector"
              isClearable={false}
              value={{
                label: translate({key: 'Show.results', replacements: [props.nbOfApis.toString()]}),
                value: props.nbOfApis,
              }}
              isSearchable={false}
              options={[5,10, 20].map((x) => ({ label: `Show ${x}`, value: x }))}
              onChange={(e: any) => props.setNbOfApis(Number(e.value))}
              classNamePrefix="reactSelect"
            />
          </div>
          <div className="section pb-1">
            {props.apiWithAuthorizations.map(({api}) => {
              if (!api.parent) {
                const tmp = props.apiWithAuthorizations.filter((temp) => temp.api.name == api.name)
                return (
                  <div className="section border-bottom" key={api._id}>
                    {tmp.length >= 1 &&
                        <ExpertApiCard apiWithAuthorization={tmp} team={props.team}
                                       subscriptions={tmp.map((tmpApi) => tmpApi.subscriptionsWithPlan)}
                                       input={props.input}
                                       showPlan={showPlan}
                                       showApiKey={showApiKey}
                                       planResearch={props.planResearch}
                        />
                    }
                  </div>

                )
              }
            })}
            <Pagination
              previousLabel={translate('Previous')}
              nextLabel={translate('Next')}
              breakLabel="..."
              breakClassName={'break'}
              pageCount={Math.ceil(props.nb / props.nbOfApis)}
              marginPagesDisplayed={1}
              pageRangeDisplayed={5}
              onPageChange={(data) => props.handlePageClick(data)}
              containerClassName={'pagination'}
              pageClassName={'page-selector'}
              forcePage={props.page}
              activeClassName={'active'}
            />
          </div>
        </div>
        <div className="col-3" style={{position: "fixed", right:0}}>
          <div className="section p-3 mb-2">
            Change Team :
            <Select
              name="team-selector"
              className="tag__selector filter__select reactSelect  "
              value={{value: props.team, label: props.team.name}}
              isClearable={false}
              options={props.teamList.map((team) => {
                return {value: team, label: team.name}
              })}
              onChange={(e) => {
                props.setTeam(e!.value)
                setIsPlan(undefined)
                localStorage.setItem('selectedTeam', JSON.stringify(e!.value));
              }}
              classNamePrefix="reactSelect"
            />
          </div>
          <div className="section p-3 mb-2">
            {translate('fastMode.reasonSubscription.title')}
            <textarea
              className="form-control"
              placeholder={translate('fastMode.input.reasonSubscription')}
              aria-label=""
              value={props.input}
              onChange={(e) => {
                props.setInput(e.target.value);
              }}
            />
          </div>
          {planInfo && isPlan &&
              <div className='p-3 mb-2 section'>
                Plan :
                <div className="card shadow-sm">
                  <div className="card-img-top card-link card-skin" data-holder-rendered="true">
                    <span>{planInfo.customName || formatPlanType(planInfo, translate)}</span>
                  </div>
                  <div className="card-body plan-body d-flex flex-column">
                    <p className="card-text text-justify">
                      {planInfo.customDescription && <span>{planInfo.customDescription}</span>}
                      {!planInfo.customDescription && planInfo.type === 'FreeWithoutQuotas' && renderPlanInfo(planInfo.type)}
                    </p>
                    <div className="d-flex flex-column mb-2">
                      <span className="plan-quotas">
                        {(planInfo!.maxPerSecond === undefined ) && translate('plan.limits.unlimited')}
                        {(planInfo!.maxPerSecond !== undefined ) &&
                            <div>
                              <div>
                                {translate({key: 'plan.limits', replacements: [planInfo.maxPerSecond.toString(), planInfo.maxPerMonth!.toString()]})}
                              </div>
                            </div>
                        }
                      </span>
                      <span className="plan-pricing">
                        {translate({key: 'plan.pricing', replacements: [renderPricing(planInfo.type)]})}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
          }
          {apiKeyValue && planInfo && subscription !== undefined && isPlan === false &&
              <div className="section p-3 mb-2">
                {translate('fastMode.apiKey.title')}
                <div className="card">
                  <div className="card-header" style={{ position: 'relative' }}>
                    <div className="d-flex align-items-center justify-content-between">

                      <BeautifulTitle
                          title={planInfo.customName}
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
                        {planInfo.customName}
                      </BeautifulTitle>
                    </div>
                    <span
                        className="badge bg-secondary"
                        style={{ position: 'absolute', left: '1.25rem', bottom: '-8px' }}
                    >
                      {Option(planInfo.customName).getOrElse(formatPlanType(planInfo, translate))}
                    </span>
                  </div>
                  <div className="card-body" style={{ margin: 0 }}>
                    <div className="row">
                      <ul className="nav nav-tabs flex-column flex-sm-row mb-2 col-12">
                        <li className="nav-item cursor-pointer">
                      <span
                          className={`nav-link ${activeTab === 'apikey' ? 'active' : ''}`}
                          onClick={() => setActiveTab('apikey')}
                      >
                        {translate('ApiKey')}
                      </span>
                        </li>
                        <li className="nav-item  cursor-pointer">
                        <span
                            className={`nav-link ${activeTab === 'token' ? 'active' : ''}`}
                            onClick={() => setActiveTab('token')}
                        >
                          {translate('Integration token')}
                        </span>
                        </li>

                      </ul>
                    </div>
                    {activeTab == 'apikey' && (
                      <>
                        <div className="mb-3">
                          <label htmlFor={`client-id`} className="">
                            {translate('Client Id')}
                          </label>
                          <div className="">
                            <input
                              style={{color: "#ffffff"}}
                              readOnly
                              disabled={true}
                              className="form-control input-sm"
                              value={subscription.apiKey.clientId}
                            />
                          </div>
                        </div>
                        <div className="mb-3">
                          <label htmlFor={`client-secret`} className="">
                            {translate("Client secret")}
                          </label>
                          <div className="input-group">
                            <input
                              style={{color: "#ffffff"}}
                              readOnly
                              disabled={true}
                              type={hide ? 'password' : ''}
                              className="form-control input-sm"
                              id={`client-secret`}
                              value={subscription.apiKey.clientSecret}
                              aria-describedby={`client-secret-addon`}
                            />
                            <div className="input-group-append">
                        <span
                          onClick={() => {
                            setHide(!hide);
                          }}
                          className={classNames('input-group-text')}
                          id={`client-secret-addon`}
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
                          <label htmlFor={`token`} className="">
                            {translate('Integration token')}
                          </label>
                          <div className="">
                      <textarea
                        readOnly
                        rows={4}
                        className="form-control input-sm"
                        id={`token`}
                        value={subscription.integrationToken}
                      />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
          }
          {isPlan === undefined &&
              <div className="section p-3 mb-2">
                {translate('fastMode.show.information')}
              </div>
          }
        </div>
      </div>
    </div>
  )
}