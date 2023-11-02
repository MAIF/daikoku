import { useContext, useEffect, useState } from 'react';
import Select from 'react-select';

import { I18nContext } from '../../core';
import * as Services from '../../services';
import { IApi, IUsagePlan, isError } from '../../types';
import { IBaseModalProps } from './types';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '../../components/utils';


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

type planOption = { label: string, value: IUsagePlan }

export const ApiSelectModal = (props: IApiSelectModalProps & IBaseModalProps) => {
  const [selectedPlan, setSelectedPlan] = useState<IUsagePlan>()
  const { translate } = useContext(I18nContext);

  const plansRequest = useQuery({ queryKey: ['plans'], queryFn: () => Services.getAllPlanOfApi(props.teamId, props.api._humanReadableId, props.api.currentVersion) })




  const plansAsOptions = (plans: Array<IUsagePlan>): Array<plans> => {
    return plans.reduce<Array<plans>>((a, plan) => {
      const groupName = `${props.api._humanReadableId}/${props.api.currentVersion}`;
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
  }

  function clonePlan() {
    props.onClose(selectedPlan!);
    props.close();
  }

  if (plansRequest.isLoading) {
    return <Spinner />
  } else if (plansRequest.data && !isError(plansRequest)) {
    const plans = plansRequest.data as Array<IUsagePlan>

    return (
      <div className="modal-content">
        <div className="modal-header">
          <h5 className="modal-title">{translate('api_select_modal.title')}</h5>
          <button type="button" className="btn-close" aria-label="Close" onClick={props.close} />
        </div>
        <div className="modal-body">
          <Select
            placeholder={translate('Search')}
            options={plansAsOptions(plans)} //@ts-ignore
            onChange={x => setSelectedPlan(x.value)}
            classNamePrefix="reactSelect"
          />
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-outline-danger" onClick={props.close}>
            {translate('Close')}
          </button>
          <button type="button" disabled={!selectedPlan} className="btn btn-outline-success" onClick={clonePlan}>
            {translate('Choose')}
          </button>
        </div>
      </div>
    )
  } else {
    return <div>Error while fetching usage plans</div>
  }

  ;
};
