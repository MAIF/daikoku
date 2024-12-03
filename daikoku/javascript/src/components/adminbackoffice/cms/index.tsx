import { getApolloContext, gql } from '@apollo/client';
import { useContext, useEffect, useRef, useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { I18nContext } from '../../../contexts';
import { Can, manage, tenant } from '../../utils';
import { Create } from './Create';
import { CONTENT_TYPES, Pages } from './Pages';
import * as Services from '../../../services';
import { Spinner } from '../..';
import { ModalContext, useTenantBackOffice } from '../../../contexts';

export interface IPage {
  id: string
  name: string
  path: string
  contentType: string
  metadata: any
}

export interface IRenderingPage {
  name: string
  content: string
  metadata: any
}

const getAllPages = () => ({
  query: gql`
    query CmsPages {
      pages {
        id
        name
        path
        contentType
        metadata
      }
    }
  `,
});

export const CMSOffice = () => {
  useTenantBackOffice();

  const location = useLocation();

  const { client } = useContext(getApolloContext());
  const { translate } = useContext(I18nContext);

  const [cmsPages, setPages] = useState<Array<IPage>>([]);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    reload();
  }, [location]);

  const reload = () => {
    //FIXME handle client setted
    client && client.query(getAllPages())
      .then((r) => setPages(r.data.pages));
  };

  const Index = ({ }) => {
    return (<div className="p-3">
      <div className="d-flex flex-row align-items-center justify-content-between mb-2">
        <h1 className="mb-0">Pages</h1>
        <div>
          <button className="btn btn-sm btn-outline-info" onClick={() => {
            if (!downloading) {
              setDownloading(true);
              Services.downloadCmsFiles()
                .then((transfer) => transfer.blob())
                .then((bytes) => {
                  const elm = document.createElement('a');
                  elm.href = URL.createObjectURL(bytes);
                  elm.setAttribute('download', 'cms.zip');
                  elm.click();
                  setDownloading(false);
                });
            }
          }}>
            {downloading ? (<Spinner heigth={18} width={18} />) : (translate('cms.export_all'))}
          </button>
        </div>
      </div>

      <Pages pages={cmsPages} removePage={(id: string) => setPages(cmsPages.filter((f) => f.id !== id))} />
    </div>);
  };

  return (
    <Can I={manage} a={tenant} dispatchError>
      <Routes>
        <Route path={`/:id`} element={<Create pages={cmsPages} />} />
        <Route path="*" element={<Index />} />
      </Routes>
    </Can>
  );
};