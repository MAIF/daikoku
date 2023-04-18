import { useContext, useEffect, useState } from 'react';
import Select from 'react-select';

import { I18nContext } from '../../core';
import * as Services from '../../services';
import { isError } from '../../types';
import { IApiDocumentationSelectModalProps, IBaseModalProps } from './types';

type TPage = {label: string, value: Array<{apiId: string, pageId: string, version: string}>}

export const ApiDocumentationSelectModal = (props: IApiDocumentationSelectModalProps & IBaseModalProps) => {
  const [apis, setApis] = useState<Array<{label: string, options: TPage}>>([]);
  const [pages, setPages] = useState<Array<TPage>>([]);

  const { translate } = useContext(I18nContext);

  useEffect(() => {
    Services.getAllApiDocumentation(props.teamId, props.api._humanReadableId, props.api.currentVersion)
      .then((apis) => {
        if (!isError(apis)) {
          setApis(
            apis.map(({
              apiId,
              currentVersion,
              pages
            }) => ({
              label: `From version : ${currentVersion}`,
              options: pages.map((page) => ({
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
      }
      );
  }, []);

  const importPages = () => {
    Services.importApiPages(props.teamId, props.api._id, pages.map((p) => p.value), props.api.currentVersion)
      .then(() => props.onClose())
      .then(() => props.close());
  }

  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title">{translate('api.documentation.clone.page.modal.title')}</h5>
        <button type="button" className="btn-close" aria-label="Close" onClick={props.close} />
      </div>
      <div className="modal-body">
        <Select
          isMulti
          placeholder={translate('api.documentation.clone.page.placeholder')}
          options={apis}
          //@ts-ignore
          onChange={setPages}
          classNamePrefix="reactSelect"
        />
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-outline-danger" onClick={props.close}>
          {translate('Cancel')}
        </button>
        <button type="button" className="btn btn-outline-success" onClick={importPages}>
          {translate('Select')}
        </button>
      </div>
    </div>
  );
};
