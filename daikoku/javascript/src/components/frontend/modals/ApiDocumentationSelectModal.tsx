import Select from 'react-select';
import React, { useContext, useEffect, useState } from 'react';
import * as Services from '../../../services';
import { I18nContext } from '../../../core';

export const ApiDocumentationSelectModal = ({
  closeModal,
  teamId,
  api,
  onClose
}: any) => {
  const [apis, setApis] = useState([]);
  const [pages, setPages] = useState([]);

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  useEffect(() => {
    Services.getAllApiDocumentation(teamId, api._humanReadableId, api.currentVersion).then(
      (apis) => {
        setApis(
          apis.map(({
            apiId,
            currentVersion,
            pages
          }: any) => ({
            label: `From version : ${currentVersion}`,
            options: pages.map((page: any) => ({
              label: page.title,

              value: {
                apiId,
                pageId: page._id,
                version: currentVersion,
              }
            })),
          }))
        );
      }
    );
  }, []);

  function importPages() {
    Services.importApiPages(teamId, api._id, pages.map((p) => (p as any).value), api.currentVersion)
    .then(() => onClose())
    .then(() => closeModal());
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
          isMulti
          placeholder={translateMethod('Select all pages')}
          options={apis}
          // @ts-expect-error TS(2322): Type 'Dispatch<SetStateAction<never[]>>' is not as... Remove this comment to see the full error message
          onChange={setPages}
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
        <button type="button" className="btn btn-outline-success" onClick={importPages}>
          {translateMethod('Choose', 'Close')}
        </button>
      </div>
    </div>
  );
};
