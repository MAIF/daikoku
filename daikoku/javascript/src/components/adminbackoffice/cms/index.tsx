import { useContext, useEffect, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { I18nContext } from '../../../contexts';
import { Can, manage, tenant } from '../../utils';
import { Create } from './Create';
import { Pages } from './Pages';
import * as Services from '../../../services';
import { useTenantBackOffice } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import { ICmsPageGQL } from '../../../types';

export interface IRenderingPage {
  name: string
  content: string
  metadata: any
}

const getAllPages = `
    query CmsPages {
      pages {
        id
        name
        path
        contentType
        metadata
      }
    }
  `;

export const CMSOffice = () => {
  useTenantBackOffice();

  const location = useLocation();

  const { customGraphQLClient } = useContext(GlobalContext);
  const { translate } = useContext(I18nContext);

  const [cmsPages, setPages] = useState<Array<ICmsPageGQL>>([]);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    reload();
  }, [location]);

  const reload = () => {
    customGraphQLClient.request<{ pages: Array<ICmsPageGQL> }>(getAllPages)
      .then((r) => setPages(r.pages));
  };

  const Index = () => {
    return (<div className="p-3">
      <div className="d-flex flex-row align-items-center justify-content-between mb-2">
        <h1 className="mb-0">Pages</h1>
      </div>

      <Pages pages={cmsPages} reload={reload} />
    </div>);
  };

  return (
    <Can I={manage} a={tenant} dispatchError>
      <Routes>
        <Route path={`/:id`} element={<Create />} />
        <Route path="*" element={<Index />} />
      </Routes>
    </Can>
  );
};
