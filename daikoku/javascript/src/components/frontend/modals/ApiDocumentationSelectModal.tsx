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
  const [apis, setApis] = useState<Array<any>>([]);
  const [pages, setPages] = useState<Array<any>>([]);

  const { translate } = useContext(I18nContext);

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
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title">{translate('api_select_modal.title')}</h5>
        <button type="button" className="btn-close" aria-label="Close" onClick={closeModal} />
      </div>
      <div className="modal-body">
        <Select
          isMulti
          placeholder={translate('Select all pages')}
          options={apis}
          //@ts-ignore
          onChange={setPages}
          classNamePrefix="reactSelect"
        />
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-outline-danger" onClick={closeModal}>
          {translate('Close')}
        </button>
        <button type="button" className="btn btn-outline-success" onClick={importPages}>
          {translate('Choose')}
        </button>
      </div>
    </div>
  );
};
