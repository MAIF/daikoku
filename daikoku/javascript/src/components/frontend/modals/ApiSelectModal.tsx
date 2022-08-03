import Select from 'react-select';
import React, { useContext, useEffect, useState } from 'react';
import * as Services from '../../../services';
import { I18nContext } from '../../../core';

export const ApiSelectModal = ({
  closeModal,
  teamId,
  api,
  onClose
}: any) => {
  const [apis, setApis] = useState([]);
  const [plan, setPlan] = useState();

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  useEffect(() => {
    Services.getAllPlanOfApi(teamId, api._humanReadableId, api.currentVersion).then((apis) => {
      setApis(
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
    // @ts-expect-error TS(2532): Object is possibly 'undefined'.
    onClose(plan.value);
    closeModal();
  }

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="modal-content">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-header">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <h5 className="modal-title">{translateMethod('api_select_modal.title')}</h5>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button type="button" className="btn-close" aria-label="Close" onClick={closeModal} />
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-body">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Select
          placeholder={translateMethod('Search')}
          options={apis}
          // @ts-expect-error TS(2322): Type 'Dispatch<SetStateAction<undefined>>' is not ... Remove this comment to see the full error message
          onChange={setPlan}
          classNamePrefix="reactSelect"
        />
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="modal-footer">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button type="button" className="btn btn-outline-danger" onClick={closeModal}>
          {translateMethod('Close', 'Close')}
        </button>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button type="button" className="btn btn-outline-success" onClick={clonePlan}>
          {translateMethod('Choose', 'Close')}
        </button>
      </div>
    </div>
  );
};
