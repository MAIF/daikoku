import Select from 'react-select';
import React, { useEffect, useState } from 'react';
import { t } from '../../../locales';
import * as Services from '../../../services';

export const ApiDocumentationSelectModal = ({
  closeModal,
  currentLanguage,
  teamId,
  api,
  onClose,
}) => {
  const [apis, setApis] = useState([]);
  const [pages, setPages] = useState([]);

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

  console.log(apis);

  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title">{t('api_select_modal.title', currentLanguage)}</h5>
        <button type="button" className="close" aria-label="Close" onClick={closeModal}>
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div className="modal-body">
        <Select
          isMulti
          placeholder={t('Select all pages', currentLanguage)}
          options={apis}
          onChange={setPages}
          classNamePrefix="reactSelect"
        />
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-outline-danger" onClick={closeModal}>
          {t('Close', currentLanguage, 'Close')}
        </button>
        <button type="button" className="btn btn-outline-success" onClick={importPages}>
          {t('Choose', currentLanguage, 'Close')}
        </button>
      </div>
    </div>
  );
};
