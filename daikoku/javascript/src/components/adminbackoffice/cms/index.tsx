import { getApolloContext, gql } from '@apollo/client';
import React, { useContext, useEffect, useRef, useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { I18nContext } from '../../../contexts';
import { Can, manage, tenant } from '../../utils';
import { Create } from './Create';
import { CONTENT_TYPES, Pages } from './Pages';
import * as Services from '../../../services';
import { Spinner } from '../..';
import Revisions from './Revisions';
import { ModalContext, useTenantBackOffice } from '../../../contexts';
import { constraints, type } from '@maif/react-forms';

export interface IPage {
  id: string
  name: string
  path: string
  contentType: string
  lastPublishedDate: string
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
        lastPublishedDate
        metadata
      }
    }
  `,
});

export const CMSOffice = () => {
  useTenantBackOffice();

  const location = useLocation();
  const navigate = useNavigate();

  const { client } = useContext(getApolloContext());
  const { translate } = useContext(I18nContext);
  const { prompt, openFormModal } = useContext(ModalContext);

  const [cmsPages, setPages] = useState<Array<IPage>>([]);
  const [downloading, setDownloading] = useState(false);

  const importRef = useRef<HTMLInputElement | null>();

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

  const loadFiles = (e) => {
    if (e.target.files.length === 1) {
      Services.uploadZip(e.target.files[0])
        .then(reload);
    }
  };

  const calculateGroups = (items: Array<IPage>) => {
    const pages: Array<IPage> = []
    const apis: Array<IPage> = []
    const blocks: Array<IPage> = []
    const data: Array<IPage> = []
    const mails: Array<IPage> = []
    const scripts: Array<IPage> = []
    const styles: Array<IPage> = []

    items.forEach(item => {
      const group = item.path?.split("/")[0]

      if (group === 'mails')
        mails.push(item)
      else if (group === "blocks")
        blocks.push(item)
      else if (group === "apis")
        apis.push(item)
      else {
        const type = CONTENT_TYPES.find((f) => f.value === item.contentType)?.label || 'HTML'

        if (type === "JS")
          scripts.push(item)
        else if (type === "CSS")
          styles.push(item)
        else if (type !== "HTML")
          data.push(item)
        else
          pages.push(item)
      }
    })

    return { pages, apis, blocks, data, mails, scripts, styles }
  }

  const { pages, apis, blocks, data, mails, scripts, styles } = calculateGroups(cmsPages)

  const Index = ({ }) => {
    return (<div className="p-3">
      <div className="d-flex flex-row align-items-center justify-content-between mb-2">
        <h1 className="mb-0">Pages</h1>
        <div>
          {/* <div className="btn-group dropstart">
            <button type="button" className="btn btn-sm me-1 btn-outline-primary" data-bs-toggle="dropdown" aria-expanded="false">
              <i className="fas fa-cog"></i>
            </button>
            <ul className="dropdown-menu"> */}
          <li className="dropdown-item" onClick={() => importRef.current?.click()}>
            <input ref={r => importRef.current = r} type="file" accept=".zip" className="form-control hide" onChange={loadFiles} />
            {translate('cms.import_all')}
          </li>
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
          {/* </ul> */}
          {/* </div> */}
          {/* <button onClick={() => {
            prompt({
              message: translate('page.prompt.creation.message'),
              title: translate('page.prompt.creation.title'),
              placeholder: translate('page.prompt.creation.placeholder'),
              okLabel: translate('Create')
            })
              .then((newPageName) => {
                if (newPageName) {
                  Services.createCmsPageWithName(newPageName)
                    .then((res) => navigate(`${location.pathname}/edit/${res._id}`));
                }
              });
          }} className="btn btn-sm btn-outline-success">
            {translate('cms.index.new_page')}
          </button> */}
        </div>
      </div>

      <Stats
        pages={pages}
        apis={apis}
        blocks={blocks}
        data={data}
        mails={mails}
        scripts={scripts}
        styles={styles}
      />
      <Pages pages={cmsPages} removePage={(id: string) => setPages(cmsPages.filter((f) => f.id !== id))} />
    </div>);
  };

  return (
    <Can I={manage} a={tenant} dispatchError>
      <Routes>
        <Route path={`/new`} element={<Create pages={cmsPages} />} />
        <Route path={`/edit/:id/revisions`} element={<Revisions />} />
        <Route path={`/edit/:id`} element={<Create pages={cmsPages} />} />
        <Route path="*" element={<Index />} />
      </Routes>
    </Can>
  );
};

function Stats({ pages, apis, blocks, data, mails, scripts, styles }) {

  const arr = [
    { value: pages.length, label: 'Pages' },
    { label: "Blocks", value: blocks.length },
    { label: "APIs", value: apis.length },
    { label: "Data", value: data.length },
    { label: "Mails", value: mails.length },
    { label: "Scripts", value: scripts.length },
    { label: "Styles", value: styles.length },
  ].sort((a, b) => a.value > b.value ? -1 : 1)

  return <div className='d-flex flex-wrap items-center gap-2 my-3'>
    {arr.map(page => <Stat key={page.label} title={page.label} value={page.value} />)}
  </div>
}

function Stat({ value, title }) {
  return <div className="level3 p-2 pt-0 d-flex flex-column align-items-center justify-content-between rounded" style={{ flex: 1 }}>
    <div style={{ fontSize: '3rem' }} className='text-center'>{value}</div>
    <div style={{ fontSize: '1rem' }} className='text-center'>{title}</div>
  </div>
}

