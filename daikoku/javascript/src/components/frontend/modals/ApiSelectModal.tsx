import Select from 'react-select';
import React, { useContext, useEffect, useState } from 'react';
import * as Services from '../../../services';
import { I18nContext } from '../../../core';

//FIXME: no need this modal==> replace by a simple FormModal
export const ApiSelectModal = ({
  closeModal,
  teamId,
  api,
  onClose
}: any) => {
  const [plans, setPlans] = useState([]);
  const [plan, setPlan] = useState<any>();

  const { translateMethod } = useContext(I18nContext);

  useEffect(() => {
    Services.getAllPlanOfApi(teamId, api._humanReadableId, api.currentVersion)
      .then((apis) => {
        setPlans(
          apis.flatMap((api: any) => api.possibleUsagePlans.reduce((a: any, plan: any) => {
            const groupName = `${api._humanReadableId}/${api.currentVersion}`;
            const optGroup = a.find((grp: any) => grp.label === groupName);
            if (!optGroup)
              return [
                ...a,
                {
                  options: [{ label: plan.customName || plan.type, value: plan }],
                  label: groupName,
                },
              ];

            return a.map((group: any) => {
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
    onClose(plan.value);
    closeModal();
  }

  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title">{translateMethod('api_select_modal.title')}</h5>
        <button type="button" className="btn-close" aria-label="Close" onClick={closeModal} />
      </div>
      <div className="modal-body">
        <Select
          placeholder={translateMethod('Search')}
          options={plans}
          onChange={setPlan}
          classNamePrefix="reactSelect"
        />
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-outline-danger" onClick={closeModal}>
          {translateMethod('Close', 'Close')}
        </button>
        <button type="button" className="btn btn-outline-success" onClick={clonePlan}>
          {translateMethod('Choose', 'Close')}
        </button>
      </div>
    </div>
  );
};
