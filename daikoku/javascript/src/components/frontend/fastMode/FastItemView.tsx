import { useContext, useState } from "react";
import Eye from 'react-feather/dist/icons/eye';
import EyeOff from 'react-feather/dist/icons/eye-off';

import { I18nContext } from "../../../core";
import { IFastApiSubscription, IFastPlan, isPayPerUse, isQuotasWitoutLimit, IUsagePlan } from "../../../types";
import { Currency } from "../../backoffice/apis/TeamApiConsumption";
import { BeautifulTitle, formatCurrency, formatPlanType, getCurrencySymbol, Option } from "../../utils";
import { currency } from "../api/ApiPricing";
import { FastItemViewMode } from "./FastApiList";

type FastItemViewProps = {
  viewMode: FastItemViewMode,
  planInfo?: IFastPlan,
  subscription?: IFastApiSubscription
}

export const FastItemView = (props: FastItemViewProps) => {
  const {translate} = useContext(I18nContext);

  const [activeTab, setActiveTab] = useState<'apikey' | 'token'>('apikey');
  const [hidePassword, setHidePassword] = useState(true);



  //todo: extract to utils.ts & refactor usage in other pages
  const renderPricing = (plan: IFastPlan | IUsagePlan) => {
    let pricing = translate('Free');
    const req = translate('req.');

    const month = translate('month');
    if (isQuotasWitoutLimit(plan)) {
      pricing = `${formatCurrency(plan.costPerMonth)} ${getCurrencySymbol(plan.currency)}/${month} + 
      ${formatCurrency(plan.costPerAdditionalRequest)} ${getCurrencySymbol(plan.currency)}/${req}`
    } else if (isPayPerUse(plan)) {
      pricing = `${formatCurrency(plan.costPerRequest)} ${getCurrencySymbol(plan.currency)}/${req}`;
    } else if (plan.costPerMonth) {
      pricing = `${formatCurrency(plan.costPerMonth)} ${getCurrencySymbol(plan.currency)}/${month}`;
    }
    return pricing;
  }

  //todo: extract to utils.ts & refactor usage in other pages
  const renderPlanInfo = (type: string) => {
    return (
      <span>
        {type === 'FreeWithoutQuotas' &&
          <>
            {translate('free.without.quotas.desc')}
          </>
        } {type === 'FreeWithQuotas' &&
          <>
            {translate({ key: 'free.with.quotas.desc', replacements: [props.planInfo!.maxPerMonth!.toString()] })}
          </>
        } {type === 'QuotasWithLimits' &&
          <>
            {translate({ key: 'quotas.with.limits.desc', replacements: [props.planInfo!.costPerMonth!.toString(), currency(props.planInfo), props.planInfo!.maxPerMonth!.toString()] })}
            You'll pay {props.planInfo!.costPerMonth}
            <Currency plan={props.planInfo} /> and you'll have {props.planInfo!.maxPerMonth} authorized requests
            per month
          </>
        } {type === 'QuotasWithoutLimits' &&
          <>
            {translate({
              key: 'quotas.without.limits.desc', replacements:
                [props.planInfo!.costPerMonth!.toString(), currency(props.planInfo), props.planInfo!.maxPerMonth!.toString(), props.planInfo!.costPerAdditionalRequest!.toString(), currency(props.planInfo)]
            })}
            You'll pay {props.planInfo!.costPerMonth}
            <Currency plan={props.planInfo} /> for {props.planInfo!.maxPerMonth} authorized requests per month and
            you'll be charged {props.planInfo!.costPerAdditionalRequest}
            <Currency plan={props.planInfo} /> per additional request
          </>
        } {type === 'PayPerUse' &&
          <>
            {translate({
              key: 'pay.per.use.desc.default', replacements:
                [props.planInfo!.costPerMonth!.toString(), currency(props.planInfo), props.planInfo!.costPerRequest!.toString(), currency(props.planInfo)]
            })}
            {props.planInfo!.costPerMonth === 0.0 &&
              <>
                You'll pay {props.planInfo!.costPerMonth}
                <Currency plan={props.planInfo} /> per month and you'll be charged{' '}
                {props.planInfo!.costPerRequest}
                <Currency plan={props.planInfo} /> per request
              </>
            }
            {props.planInfo!.costPerMonth !== 0.0 &&
              <>
                You'll be charged {props.planInfo!.costPerRequest}
                <Currency plan={props.planInfo} /> per request
              </>
            } </>
        }
      </span>
    )
  }

  return (
    <div className="section p-3 mb-2 text-center">
            {props.viewMode === 'PLAN' && props.planInfo &&
              <div className="card shadow-sm">
                <div className="card-img-top card-link card-skin" data-holder-rendered="true">
                  <span>{props.planInfo.customName || formatPlanType(props.planInfo, translate)}</span>
                </div>
                <div className="card-body plan-body d-flex flex-column">
                  <p className="card-text text-justify">
                    {props.planInfo.customDescription && <span>{props.planInfo.customDescription}</span>}
                    {!props.planInfo.customDescription && props.planInfo.type === 'FreeWithoutQuotas' && renderPlanInfo(props.planInfo.type)}
                  </p>
                  <div className="d-flex flex-column mb-2">
                    <span className="plan-quotas">
                      {(props.planInfo!.maxPerSecond === undefined) && translate('plan.limits.unlimited')}
                      {(props.planInfo!.maxPerSecond !== undefined) &&
                        <div>
                          {translate({ key: 'plan.limits', replacements: [props.planInfo.maxPerSecond.toString(), props.planInfo.maxPerMonth!.toString()] })}
                        </div>
                      }
                    </span>
                    <span className="plan-pricing">
                      {translate({ key: 'plan.pricing', replacements: [renderPricing(props.planInfo)] })}
                    </span>
                  </div>
                </div>
              </div>
            }
            {props.viewMode === 'APIKEY' && props.planInfo && props.subscription &&
              <div className="card">
                <div className="card-header" style={{ position: 'relative' }}>
                  <div className="d-flex align-items-center justify-content-between">
                    <BeautifulTitle
                      title={props.planInfo.customName}
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
                      {props.planInfo.customName}
                    </BeautifulTitle>
                  </div>
                  <span
                    className="badge bg-secondary"
                    style={{ position: 'absolute', left: '1.25rem', bottom: '-8px' }}
                  >
                    {Option(props.planInfo.customName).getOrElse(formatPlanType(props.planInfo, translate))}
                  </span>
                </div>
                <div className="card-body" style={{ margin: 0 }}>
                  <div className="row">
                    <ul className="nav nav-tabs flex-row">
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
                          {translate('fastMode.token.label')}
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
                            style={{ color: "#ffffff" }}
                            readOnly
                            disabled={true}
                            className="form-control input-sm"
                            value={props.subscription.apiKey.clientId}
                          />
                        </div>
                      </div>
                      <div className="mb-3">
                        <label htmlFor={`client-secret`} className="">
                          {translate("Client secret")}
                        </label>
                        <div className="input-group">
                          <input
                            style={{ color: "#ffffff" }}
                            readOnly
                            disabled={true}
                            type={hidePassword ? 'password' : ''}
                            className="form-control input-sm"
                            id={`client-secret`}
                            value={props.subscription.apiKey.clientSecret}
                            aria-describedby={`client-secret-addon`}
                          />
                          <div className="input-group-append">
                            <span
                              onClick={() => {
                                setHidePassword(!hidePassword);
                              }}
                              className={'input-group-text cursor-pointer'}
                              id={`client-secret-addon`}
                            >
                              {hidePassword ? <Eye /> : <EyeOff />}
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
                            value={props.subscription.integrationToken}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            }
            {props.viewMode === 'NONE' &&
              <>{translate('fastMode.show.information')}</>
            }
          </div>
  )
}