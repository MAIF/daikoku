import { useContext, useState } from "react";
import ArrowLeft from 'react-feather/dist/icons/arrow-left';
import ArrowRight from 'react-feather/dist/icons/arrow-right';
import Eye from 'react-feather/dist/icons/eye';
import EyeOff from 'react-feather/dist/icons/eye-off';

import { I18nContext } from "../../../contexts";
import { IFastApiSubscription, IFastPlan } from "../../../types";
import {
  renderPlanInfo,
  renderPricing
} from "../../utils";
import { FastItemViewMode } from "./FastApiList";

type FastItemViewProps = {
  viewMode: FastItemViewMode,
  planInfo?: IFastPlan,
  subscriptions?: Array<IFastApiSubscription>
}

export const FastItemView = (props: FastItemViewProps) => {
  const { translate } = useContext(I18nContext);

  const [activeTab, setActiveTab] = useState<'apikey' | 'token'>('apikey');
  const [hidePassword, setHidePassword] = useState(true);
  const [idxSubscription, setIdxSubscription] = useState(0);

  const handlePreviousSubs = () => {
    const prevIdx = idxSubscription === 0 ? props.subscriptions!.length - 1 : idxSubscription - 1;
    setIdxSubscription(prevIdx);
  }

  const handleNextSubs = () => {
    const nextIdx = idxSubscription === props.subscriptions!.length - 1 ? 0 : idxSubscription + 1;
    setIdxSubscription(nextIdx);
  }

  return (
    <div className="section p-3 mb-2 text-center">
      {props.viewMode === 'PLAN' && props.planInfo &&
        <div className="card shadow-sm">
          <div className="card-img-top card-link card-header" data-holder-rendered="true">
            <span>{props.planInfo.customName}</span>
          </div>
          <div className="card-body plan-body d-flex flex-column">
            <p className="card-text text-justify">
              {props.planInfo.customDescription && <span>{props.planInfo.customDescription}</span>}
              {!props.planInfo.customDescription && renderPlanInfo(props.planInfo)}
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
                {translate({ key: 'plan.pricing', replacements: [renderPricing(props.planInfo, translate)] })}
              </span>
            </div>
          </div>
        </div>
      }
      {props.viewMode === 'APIKEY' && props.planInfo && props.subscriptions &&
        <div className="card">
          <div className="card-header flex-column">
            {props.planInfo.customName}
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
                      value={props.subscriptions[idxSubscription].apiKey.clientId}
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
                      value={props.subscriptions[idxSubscription].apiKey.clientSecret}
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
                      value={props.subscriptions[idxSubscription].integrationToken}
                    />
                  </div>
                </div>
              </>
            )}
            {props.subscriptions && props.subscriptions.length > 1 && (
              <div className="d-flex flex-row justify-content-between">
                <ArrowLeft className="cursor-pointer" onClick={handlePreviousSubs} />
                <div>{`${idxSubscription + 1}/${props.subscriptions.length}`}</div>
                <ArrowRight className="cursor-pointer" onClick={handleNextSubs} />
              </div>
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