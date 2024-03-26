import { useQuery } from '@tanstack/react-query';
import { useContext, useState } from 'react';
import Select from 'react-select';

import { Spinner } from '../../components/utils/Spinner';
import { I18nContext } from '../../contexts';
import { IImportingDocumentation, isError } from '../../types';
import { IApiDocumentationSelectModalProps, IBaseModalProps } from './types';

type TPage = { label: string, value: { _id: string, pageId: string, version: string } }

export const ApiDocumentationSelectModal = (props: IApiDocumentationSelectModalProps & IBaseModalProps) => {
  const [pages, setPages] = useState<Array<TPage>>([]);

  const { translate } = useContext(I18nContext);

  const pagesQuery = useQuery({ queryKey: ['pages'], queryFn: () => props.getDocumentationPages() })

  const importPages = (linked?: boolean) => {
    // Services.importApiPages(props.teamId, props.api._id, pages.map((p) => p.value), props.api.currentVersion)
    props.importPages(pages.flatMap(p => p.value.pageId), linked)
      .then(() => props.onClose())
      .then(() => props.close());
  }

  const getOptions = (docs: Array<IImportingDocumentation>) => {
    return docs.map(({
      _id,
      from,
      pages
    }) => ({
      label: `From : ${from}`,
      options: pages.map((page) => ({
        label: page.title,
        value: {
          _id,
          pageId: page._id,
          version: from,
        }
      })),
    }))
  }


  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title">{translate('api.documentation.clone.page.modal.title')}</h5>
        <button type="button" className="btn-close" aria-label="Close" onClick={props.close} />
      </div>
      <div className="modal-body">
        {pagesQuery.isLoading && <Spinner />}
        {pagesQuery.data && !isError(pagesQuery.data) && (
          <>
            <Select
              isMulti
              placeholder={translate('api.documentation.clone.page.placeholder')}
              options={getOptions(pagesQuery.data)}
              //@ts-ignore
              onChange={setPages}
              classNamePrefix="reactSelect"
            />
          </>
        )}
        {pagesQuery.data && isError(pagesQuery.data) && (
          <div>Error while fetching pages</div>
        )}
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-outline-danger" onClick={props.close}>
          {translate('Cancel')}
        </button>
        <button type="button" disabled={pagesQuery.isLoading || pagesQuery.isError} className="btn btn-outline-success" onClick={() => importPages(true)}>
          {translate('Use same')}
        </button>
        <button type="button" disabled={pagesQuery.isLoading || pagesQuery.isError} className="btn btn-outline-success" onClick={() => importPages(false)}>
          {translate('Clone')}
        </button>

      </div>
    </div>
  );
};
