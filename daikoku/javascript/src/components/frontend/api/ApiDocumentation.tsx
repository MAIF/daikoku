/* eslint-disable react/display-name */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import asciidoctor from 'asciidoctor';
import classNames from 'classnames';
import hljs from 'highlight.js';
import { useContext, useEffect, useState } from 'react';
import More from 'react-feather/dist/icons/more-vertical';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { I18nContext, ModalContext } from '../../../contexts';
import { converter } from '../../../services/showdown';
import { IApi, IDocPage, IDocumentation, IDocumentationPages, isError, ITeamSimple, IWithDocumentation, IWithSwagger, ResponseError } from '../../../types';
import { api as API, Can, manage, Spinner } from '../../utils';
import * as Services from '../../../services';


import 'highlight.js/styles/monokai.css';
import { ParamKeyValuePair, useSearchParams } from 'react-router-dom';
import { CmsViewer } from '../CmsViewer';

type ApiDocumentationCartidgeProps = {
  documentation?: IDocumentation
  currentPageId?: string
  goTo: (pageId: string) => void
}
export const ApiDocumentationCartidge = (props: ApiDocumentationCartidgeProps) => {
  const renderLinks = (pages?: IDocumentationPages, level: number = 0) => {
    if (!pages || !pages.length) {
      return null;
    } else {
      return (
        <ul>
          {pages.map((page) => {
            return (
              <li className="api-doc-cartridge-link cursor-pointer" key={page.id} style={{ marginLeft: level * 10 }}>
                <a className={classNames({ active: page.id === props.currentPageId })} onClick={() => props.goTo(page.id)}>
                  {page.title}
                </a>
                {renderLinks(page.children, level + 1)}
              </li>
            );
          })}
        </ul>
      )
    }
  }


  return (
    <div className="d-flex col-12 col-sm-3 col-md-2 flex-column p-3 text-muted navDocumentation album">
      {renderLinks(props.documentation?.pages)}
    </div>
  );
}

type ApiDocPageProps = {
  pageId?: string,
  api: IApi,
  getDocPage: (id: string) => Promise<IDocPage | ResponseError>
}
const ApiDocPage = (props: ApiDocPageProps) => {
  const queryClient = useQueryClient();
  const pageRequest = useQuery({
    queryKey: ['page', { pageId: props.pageId }],
    queryFn: ({ queryKey }) => {
      const [_key, keys] = queryKey //@ts-ignore
      return props.getDocPage(keys.pageId)
    }
  });

  useEffect(() => {
    if (pageRequest.data && !isError(pageRequest.data)) {
      if (pageRequest.data.content)
        (window as any).$('pre code').each((i: any, block: any) => {
          hljs.highlightElement(block);
        });
    }
  }, [pageRequest.data]);

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['page'] })
  }, [props.pageId])


  if (pageRequest.isLoading) {
    return <Spinner />
  } else if (pageRequest.data && !isError(pageRequest.data)) {
    if (isError(pageRequest.data)) {
      return <span>Error while fetching documentation page: {pageRequest.data.error}</span>
    } else if (pageRequest.data.remoteContentEnabled) {
      return (
        <AwesomeContentViewer
          api={props.api}
          contentType={pageRequest.data.contentType}
          remoteContent={{ url: pageRequest.data.remoteContentUrl! }} />
      )
    } else {
      return (
        <AwesomeContentViewer
          api={props.api}
          cmsPage={pageRequest.data.cmsPage}
          contentType={pageRequest.data.contentType}
          content={pageRequest.data.content} />
      )
    }
  } else {
    return <span>Error while fetching documentation page</span>
  }


}

type ApiDocumentationProps<T extends IWithDocumentation> = {
  documentation?: IDocumentation
  api: IApi,
  getDocPage: (pageId: string) => Promise<IDocPage | ResponseError>
  ownerTeam: ITeamSimple
  entity: T
}


export const ApiDocumentation = <T extends IWithDocumentation>(props: ApiDocumentationProps<T>) => {
  const { Translation } = useContext(I18nContext);
  const { openRightPanel, closeRightPanel, openApiDocumentationSelectModal } = useContext(ModalContext);
  const { translate } = useContext(I18nContext);

  const [searchParams, setSearchParams] = useSearchParams();

  const [updateView, setUpdateView] = useState(false);

  const page = searchParams.get('page');
  // const [pageId, setPageId] = useState(page || props.documentation?.pages[0].id);
  const [pageId, setPageId] = useState<string>();

  const flattenDoc = (pages?: IDocumentationPages): Array<string> => {
    if (!pages) {
      return []
    } else {
      return pages.flatMap(p => [p.id, ...flattenDoc(p.children)])
    }
  }

  useEffect(() => {
    if (pageId) {
      setSearchParams({ page: pageId })
    }
  }, [pageId])


  const orderedPages = flattenDoc(props.documentation?.pages)

  const idx = orderedPages.findIndex(p => p === pageId)
  const next = orderedPages[idx + (pageId ? 1 : 2)];
  const prev = orderedPages[idx - 1];

  return (
    <div>
      <Can I={manage} a={API} team={props.ownerTeam}>
        <div
          className="dropdown"
          style={{
            position: 'absolute',
            top: '0px',
            right: '15px',
            zIndex: '100',
          }}
        >
          <More
            className="fa fa-cog cursor-pointer dropdown-menu-button"
            style={{ fontSize: '20px' }}
            data-bs-toggle="dropdown"
            aria-expanded="false"
            id="dropdownMenuButton"
          />
          <div className="dropdown-menu" aria-labelledby="dropdownMenuButton">
            <span
              onClick={() => setUpdateView(true)}
              className="dropdown-item cursor-pointer"
            >
              Modifier la documentation
            </span>
            <div className="dropdown-divider" />
            <span
              className="dropdown-item cursor-pointer"
              onClick={() => openRightPanel({
                title: "Ajouter une nouvelle page de doc",
                content: <div>toto</div>
              })}
            >
              Ajouter une page
            </span>
            <span
              className="dropdown-item cursor-pointer"
              onClick={() => openApiDocumentationSelectModal({
                api: props.entity, //FIXME: oops
                teamId: props.ownerTeam._id,
                onClose: () => {
                  toast.success(translate('doc.page.import.successfull'));
                  // reloadApi() //todo: reload page
                },
                getDocumentationPages: () => Services.getAllApiDocumentation(props.ownerTeam._id, props.entity._id, props.entity.currentVersion), //FIXME: plan have no current version
                importPages: (pages: Array<string>, linked?: boolean) => Services.importApiPages(props.ownerTeam._id, props.entity._id, pages, props.entity.currentVersion, linked) //FIXME: plan have no current version
              })}
            >
              cloner une page
            </span>
          </div>
        </div>
      </Can>
      {pageId && (<div className='d-flex flex-row'>
        <ApiDocumentationCartidge documentation={props.documentation} currentPageId={pageId} goTo={setPageId} />
        <div className="col p-3 d-flex flex-column">
          <div className={classNames("d-flex", {
            'justify-content-between': !!prev,
            'justify-content-end': !prev,
          })}>
            {prev && (<button className='btn btn-sm btn-outline-primary' onClick={() => setPageId(prev)}>
              <i className="fas fa-chevron-left me-1" />
              <Translation i18nkey="Previous page">Previous page</Translation>
            </button>)}
            {next && (<button className='btn btn-sm btn-outline-primary' onClick={() => setPageId(next)}>
              <Translation i18nkey="Next page">Next page</Translation>
              <i className="fas fa-chevron-right ms-1" />
            </button>)}
          </div>
          <ApiDocPage pageId={pageId} getDocPage={props.getDocPage} />
        </div >
      </div>)}
      {!pageId && (
        <div>
          <span>
            seems like you have not yet setup your api documentation
          </span>
          <button className='btn btn-outline-primary'>add a first page</button>
        </div>
      )}
    </div>
  )
}

const TypeNotSupportedYet = () => <h3>Content type not supported yet !</h3>;
const Image = (props: any) => <img src={props.url} style={{ width: '100%' }} alt={props.alt} />;
const Video = (props: any) => <video src={props.url} style={{ width: '100%' }} />;
const Html = (props: any) => <iframe src={props.url} style={{ width: '100%', height: '100vh', border: 0 }} />;
const Pdf = ({ url }: any) => {
  return (
    <embed src={url} type="application/pdf" style={{ width: '100%', height: '100vh', border: 0 }} />
  );
};

function Markdown(props: any) {
  const [content, setContent] = useState<string>();

  useEffect(() => {
    if (props.url) update(props.url);
  }, [props.url]);

  useEffect(() => {
    if (content)
      (window as any).$('pre code').each((i: any, block: any) => {
        hljs.highlightElement(block);
      });
  }, [content]);

  const update = (url: any) => {
    fetch(url, {
      method: 'GET',
      credentials: 'include',
    })
      .then((r) => r.text())
      .then(setContent);
  };

  if (!props.content && !content) {
    return null;
  }
  return (
    <div
      className="api-description"
      dangerouslySetInnerHTML={{
        __html: converter.makeHtml(props.content || content),
      }}
    />
  );
}

function Asciidoc(props: any) {
  const [content, setContent] = useState<string>();

  useEffect(() => {
    if (props.url) update(props.url);
  }, [props.url]);

  useEffect(() => {
    if (content)
      (window as any).$('pre code').each((i: any, block: any) => {
        hljs.highlightElement(block);
      });
  }, [content]);

  const update = (url: any) => {
    fetch(url, {
      method: 'GET',
      credentials: 'include',
    })
      .then((r) => r.text())
      .then(setContent);
  };

  if (!props.content && !content) {
    return null;
  }
  const asciidoctorConverter = asciidoctor();
  return (
    <div
      className="api-description asciidoc"
      dangerouslySetInnerHTML={{
        __html: asciidoctorConverter.convert(props.content || content) as string,
      }}
    />
  );
}

function OpenDocument(props: any) {
  console.log(
    `${window.location.origin}/assets/viewerjs/index.html#${window.location.origin}${props.url}`
  );
  return (
    <iframe
      src={`/assets/viewerjs/index.html#${props.url}`}
      style={{ width: '100%', height: '100vh', border: 0 }}
    />
  );
}

const mimeTypes = [
  {
    label: '.adoc Ascii doctor',
    value: 'text/asciidoc',
    render: (url?: any, content?: any) => <Asciidoc url={url} content={content} />,
  },
  {
    label: '.avi Audio Video Interleaved file',
    value: 'video/x-msvideo',
    render: (url: any) => <Video url={url} />,
  },
  // {
  //   label: '.doc Microsoft Word file',
  //   value: 'application/msword',
  //   render: url => <OpenDocument url={url} />,
  // },
  // {
  //   label: '.docx	Microsoft Word (OpenXML) file',
  //   value: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  //   render: url => <OpenDocument url={url} />,
  // },
  {
    label: '.gif Graphics Interchange Format file',
    value: 'image/gif',
    render: (url: any) => <Image url={url} />,
  },
  {
    label: '.html HyperText Markup Language file',
    value: 'text/html',
    render: (url: any, content: any) => (url ? <Html url={url} /> : <Markdown url={url} content={content} />),
  },
  { label: '.jpg JPEG image', value: 'image/jpeg', render: (url: any) => <Image url={url} /> },
  {
    label: '.md	Markdown file',
    value: 'text/markdown',
    render: (url: any, content: any) => <Markdown url={url} content={content} />,
  },
  { label: '.mpeg	MPEG video file ', value: 'video/mpeg', render: (url: any) => <Video url={url} /> },
  {
    label: '.odp OpenDocument presentation document ',
    value: 'application/vnd.oasis.opendocument.presentation',
    render: (url: any) => <OpenDocument url={url} />,
  },
  {
    label: '.ods OpenDocument spreadsheet document ',
    value: 'application/vnd.oasis.opendocument.spreadsheet',
    render: (url: any) => <OpenDocument url={url} />,
  },
  {
    label: '.odt OpenDocument text document ',
    value: 'application/vnd.oasis.opendocument.text',
    render: (url: any) => <OpenDocument url={url} />,
  },
  {
    label: '.png Portable Network Graphics',
    value: 'image/png',
    render: (url: any) => <Image url={url} />,
  },
  {
    label: '.pdf Adobe Portable Document Format (PDF)',
    value: 'application/pdf',
    render: (url: any) => <Pdf url={url} />,
  },
  { label: '.webm WEBM video file ', value: 'video/webm', render: (url: any) => <Video url={url} /> },
  {
    label: '.cms : Page from CMS', value: 'cms/page', render: (value, ...props) => {
      console.log(value, props)
      return value
    }
  },
];

type AwesomeContentViewerProp = {
  contentType: string
  remoteContent?: { url: string }
  content?: string
  cmsPage?: string
  api: IApi,
}
const AwesomeContentViewer = (props: AwesomeContentViewerProp) => {

  if (props.cmsPage) {
    return <CmsViewer pageId={props.cmsPage} fields={{ api: props.api }} />
  }

  const mimeType = mimeTypes.filter((t) => t.value === props.contentType)[0] || {
    render: () => <TypeNotSupportedYet />,
  };
  if (props.remoteContent) {
    return mimeType.render(props.remoteContent.url);
  } else if (props.content) {
    return mimeType.render(null, props.content);
  } else {
    return <TypeNotSupportedYet />;
  }
};
