import { useContext, useEffect, useState } from 'react';
import Select from 'react-select';

import { I18nContext } from '../../core';
import * as Services from '../../services';
import { IApi, IUsagePlan } from '../../types';
import { IBaseModalProps } from './types';


export interface IModalProps {
  title: string;
  content: JSX.Element;
}

export interface IApiSelectModalProps {
  teamId: string,
  api: IApi,
  onClose: (plan: IUsagePlan) => void
}

type plans = {
  label: string, 
  options: Array<planOption>
}

type planOption = {label: string, value: IUsagePlan}

export const ApiSelectModal = (props: IApiSelectModalProps & IBaseModalProps) => {
  const [plans, setPlans] = useState<Array<plans>>([]);
  const [plan, setPlan] = useState<planOption>();

  const { translate } = useContext(I18nContext);

  useEffect(() => {
    Services.getAllPlanOfApi(props.teamId, props.api._humanReadableId, props.api.currentVersion)
      .then((apis) => {
        setPlans(
          apis.flatMap((api) => api.possibleUsagePlans.reduce<Array<plans>>((a, plan) => {
            const groupName = `${api._humanReadableId}/${api.currentVersion}`;
            const optGroup = a.find((grp) => grp.label === groupName);
            if (!optGroup)
              return [
                ...a,
                {
                  options: [{ label: plan.customName || plan.type, value: plan }],
                  label: groupName,
                },
              ];

            return a.map((group) => {
              if (group.label === groupName)
                group.options.push({ label: plan.customName || plan.type, value: plan });

              return group;
            });
          }, [])
          )
        );
      });
  }, []);

  function clonePlan() {
    if (!plan) {
      return;
    }
    props.onClose(plan.value);
    props.close();
  }

  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title">{translate('api_select_modal.title')}</h5>
        <button type="button" className="btn-close" aria-label="Close" onClick={props.close} />
      </div>
      <div className="modal-body">
        <Select
          placeholder={translate('Search')}
          options={plans} //@ts-ignore
          onChange={setPlan}
          classNamePrefix="reactSelect"
        />
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-outline-danger" onClick={props.close}>
          {translate('Close')}
        </button>
        <button type="button" className="btn btn-outline-success" onClick={clonePlan}>
          {translate('Choose')}
        </button>
      </div>
    </div>
  );
};
