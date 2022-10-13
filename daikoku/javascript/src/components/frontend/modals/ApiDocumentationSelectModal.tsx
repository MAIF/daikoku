import Select from 'react-select';
import React, { useContext, useEffect, useState } from 'react';
import * as Services from '../../../services';
import { closeModal, I18nContext } from '../../../core';
import { useSelector } from 'react-redux';
import { useDispatch } from 'react-redux';
import { IApi } from '../../../types/api';

export interface IApiDocumentationSelectModalProps {
  teamId: string
  api: IApi,
  onClose: () => void
}

type TPage = {label: string, value: Array<{apiId: string, pageId: string, version: string}>}

export const ApiDocumentationSelectModal = ({
  teamId,
  api,
  onClose
}: IApiDocumentationSelectModalProps) => {
  const [apis, setApis] = useState<Array<{label: string, options: TPage}>>([]);
  const [pages, setPages] = useState<Array<TPage>>([]);

  const { translate } = useContext(I18nContext);

  const dispatch = useDispatch();

  useEffect(() => {
    Services.getAllApiDocumentation(teamId, api._humanReadableId, api.currentVersion)
      .then((apis) => {
        setApis(
          apis.map(({
            apiId,
            currentVersion,
            pages
          }) => ({
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

  const importPages = () => {
    Services.importApiPages(teamId, api._id, pages.map((p) => p.value), api.currentVersion)
      .then(() => onClose())
      .then(() => dispatch(closeModal()));
  }

  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title">{translate('api_select_modal.title')}</h5>
        <button type="button" className="btn-close" aria-label="Close" onClick={() => dispatch(closeModal())} />
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
        <button type="button" className="btn btn-outline-danger" onClick={() => dispatch(closeModal())}>
          {translate('Cancel')}
        </button>
        <button type="button" className="btn btn-outline-success" onClick={importPages}>
          {translate('Select')}
        </button>
      </div>
    </div>
  );
};
