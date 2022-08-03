import { getApolloContext, gql } from '@apollo/client';
import React, { useContext, useEffect, useRef, useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { I18nContext } from '../../../core';
import { Can, manage, tenant } from '../../utils';
// @ts-expect-error TS(6142): Module './Create' was resolved to '/Users/qaubert/... Remove this comment to see the full error message
import { Create } from './Create';
// @ts-expect-error TS(6142): Module './Pages' was resolved to '/Users/qaubert/S... Remove this comment to see the full error message
import { Pages } from './Pages';
import * as Services from '../../../services';
import { Spinner } from '../..';
// @ts-expect-error TS(6142): Module './Revisions' was resolved to '/Users/qaube... Remove this comment to see the full error message
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
  // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
  useTenantBackOffice();

  const location = useLocation();

  const { client } = useContext(getApolloContext());
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  const [pages, setPages] = useState([]);
  const [downloading, setDownloading] = useState(false);

  const importRef = useRef();

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    if (location.state && (location as any).state.reload) {
      reload();
    }
  }, [location]);

  const reload = () => {
    // @ts-expect-error TS(2532): Object is possibly 'undefined'.
    client.query(getAllPages()).then((r) => setPages(r.data.pages));
  };

  const loadFiles = (e: any) => {
    if (e.target.files.length === 1) {
      Services.uploadZip(e.target.files[0]).then(reload);
    }
  };

  const Index = ({}) => {
    const navigation = useNavigate();
    const location = useLocation();

    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    return (<div className="pt-2">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="d-flex flex-row align-items-center justify-content-between mb-2">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <h1 className="mb-0">Pages</h1>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="btn-group dropstart">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <button type="button" className="btn btn-sm me-1 btn-secondary" data-bs-toggle="dropdown" aria-expanded="false">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <i className="fas fa-cog"></i>
              </button>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ul className="dropdown-menu">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <li className="dropdown-item" onClick={() => importRef.current.click()}>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <input ref={importRef} type="file" accept=".zip" className="form-control hide" onChange={loadFiles}/>
                  {translateMethod('cms.import_all')}
                </li>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  {downloading ? (<Spinner heigth={18} width={18}/>) : (translateMethod('cms.export_all'))}
                </li>
              </ul>
            </div>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <button onClick={() => {
        // @ts-expect-error TS(2531): Object is possibly 'null'.
        window
            // @ts-expect-error TS(2554): Expected 0-2 arguments, but got 5.
            .prompt('Indiquer le nom de la nouvelle page', '', false, "Création d'une nouvelle page", 'Nom de la nouvelle page')
            // @ts-expect-error TS(2339): Property 'then' does not exist on type 'string'.
            .then((newPageName: any) => {
            if (newPageName) {
                Services.createCmsPageWithName(newPageName).then((res) => navigation(`${location.pathname}/edit/${res._id}`));
            }
        });
    }} className="btn btn-sm btn-outline-success">
              {translateMethod('cms.index.new_page')}
            </button>
          </div>
        </div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Pages pages={pages} removePage={(id: any) => setPages(pages.filter((f) => (f as any).id !== id))}/>
      </div>);
                (window
    // @ts-expect-error TS(2554): Expected 0-2 arguments, but got 5.
    .prompt('Indiquer le nom de la nouvelle page', '', false, "Création d'une nouvelle page", 'Nom de la nouvelle page') as any).then((newPageName: any) => {
    if (newPageName) {
        Services.createCmsPageWithName(newPageName).then((res) => navigation(`${location.pathname}/edit/${res._id}`));
    }
});
              }}
              // @ts-expect-error TS(2304): Cannot find name 'className'.
              className="btn btn-sm btn-outline-success"
            >
              // @ts-expect-error TS(7006): Parameter '(Missing)' implicitly has an 'any' type... Remove this comment to see the full error message
              {translateMethod('cms.index.new_page')}
            // @ts-expect-error TS(2304): Cannot find name 'button'.
            </button>
          // @ts-expect-error TS(2304): Cannot find name 'div'.
          </div>
        // @ts-expect-error TS(2304): Cannot find name 'div'.
        </div>
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Pages pages={pages} removePage={(id: any) => setPages(pages.filter((f) => f.id !== id))} />
      // @ts-expect-error TS(2304): Cannot find name 'div'.
      </div>
    );
  };

  return (
    <Can I={manage} a={tenant} dispatchError>
      <Routes>
        <Route path={`/new`} element={<Create pages={pages} />} />
        <Route path={`/edit/:id/revisions`} element={<Revisions pages={pages} />} />
        <Route path={`/edit/:id`} element={<Create pages={pages} />} />
        <Route path="*" element={<Index />} />
      </Routes>
    </Can>
  );
};
