import { getApolloContext, gql } from '@apollo/client';
import React, { useContext, useEffect, useRef, useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { I18nContext } from '../../../core';
import { Can, manage, tenant } from '../../utils';
import { Create } from './Create';
import { Pages } from './Pages';
import * as Services from '../../../services';
import { Spinner } from '../..';
import Revisions from './Revisions';
import { useTenantBackOffice } from '../../../contexts';

const getAllPages = () => ({
  query: gql`
    query CmsPages {
      pages {
        id
        name
        path
        contentType
        lastPublishedDate
      }
    }
  `,
});

export const CMSOffice = () => {
  useTenantBackOffice();

  const location = useLocation();

  const { client } = useContext(getApolloContext());
  const { translate } = useContext(I18nContext);

  const [pages, setPages] = useState<Array<any>>([]);
  const [downloading, setDownloading] = useState(false);

  const importRef = useRef<HTMLInputElement | null>();

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    if (location.state && (location as any).state.reload) {
      reload();
    }
  }, [location]);

  const reload = () => {
    //FIXME handle client setted
    client && client.query(getAllPages()).then((r) => setPages(r.data.pages));
  };

  const loadFiles = (e: any) => {
    if (e.target.files.length === 1) {
      Services.uploadZip(e.target.files[0]).then(reload);
    }
  };

  const Index = ({ }) => {
    const navigation = useNavigate();
    const location = useLocation();

    return (<div className="pt-2">
      <div className="d-flex flex-row align-items-center justify-content-between mb-2">
        <h1 className="mb-0">Pages</h1>
        <div>
          <div className="btn-group dropstart">
            <button type="button" className="btn btn-sm me-1 btn-secondary" data-bs-toggle="dropdown" aria-expanded="false">
              <i className="fas fa-cog"></i>
            </button>
            <ul className="dropdown-menu">
              <li className="dropdown-item" onClick={() => importRef.current?.click()}>
                <input ref={r => importRef.current = r} type="file" accept=".zip" className="form-control hide" onChange={loadFiles} />
                {translate('cms.import_all')}
              </li>
              <li className="dropdown-item" onClick={() => {
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
              </li>
            </ul>
          </div>
          <button onClick={() => { //@ts-ignore
            window.prompt('Indiquer le nom de la nouvelle page', '', false, "Création d'une nouvelle page", 'Nom de la nouvelle page') //@ts-ignore //FIXME when monkey patch & ts will be compatible
              .then((newPageName: any) => {
                if (newPageName) {
                  Services.createCmsPageWithName(newPageName).then((res) => navigation(`${location.pathname}/edit/${res._id}`));
                }
              });
          }} className="btn btn-sm btn-outline-success">
            {translate('cms.index.new_page')}
          </button>
        </div>
      </div>
      <Pages pages={pages} removePage={(id: any) => setPages(pages.filter((f) => (f as any).id !== id))} />
    </div>);
  };

  return (
    <Can I={manage} a={tenant} dispatchError>
      <Routes>
        <Route path={`/new`} element={<Create pages={pages} />} />
        <Route path={`/edit/:id/revisions`} element={<Revisions />} />
        <Route path={`/edit/:id`} element={<Create pages={pages} />} />
        <Route path="*" element={<Index />} />
      </Routes>
    </Can>
  );
};
