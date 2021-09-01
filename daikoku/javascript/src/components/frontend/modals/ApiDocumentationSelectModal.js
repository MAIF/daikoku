import Select from 'react-select';
import React, { useContext, useEffect, useState } from 'react';
import * as Services from '../../../services';
import { I18nContext } from '../../../core';

export const ApiDocumentationSelectModal = ({ closeModal, teamId, api, onClose }) => {
  const [apis, setApis] = useState([]);
  const [pages, setPages] = useState([]);

  const { translateMethod } = useContext(I18nContext);

  useEffect(() => {
    Services.getAllApiDocumentation(teamId, api._humanReadableId, api.currentVersion).then(
      (apis) => {
        setApis(
          apis.map(({ apiId, currentVersion, pages }) => ({
            label: `From version : ${currentVersion}`,
            options: pages.map((page) => ({
              label: page.title,
              value: {
                apiId,
                pageId: page._id,
                version: currentVersion,
              },
            })),
          }))
        );
      }
    );
  }, []);

  function importPages() {
    Services.importApiPages(
      teamId,
      api._id,
      pages.map((p) => p.value),
      api.currentVersion
    )
      .then(() => onClose())
      .then(() => closeModal());
  }

  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title">{translateMethod('api_select_modal.title')}</h5>
        <button type="button" className="close" aria-label="Close" onClick={closeModal}>
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div className="modal-body">
        <Select
          isMulti
          placeholder={translateMethod('Select all pages')}
          options={apis}
          onChange={setPages}
          classNamePrefix="reactSelect"
        />
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-outline-danger" onClick={closeModal}>
          {translateMethod('Close', 'Close')}
        </button>
        <button type="button" className="btn btn-outline-success" onClick={importPages}>
          {translateMethod('Choose', 'Close')}
        </button>
      </div>
    </div>
  );
};
