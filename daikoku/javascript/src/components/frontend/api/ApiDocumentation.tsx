/* eslint-disable react/display-name */
import React, { useContext, useEffect, useState } from 'react';
import hljs from 'highlight.js';
import { Link, useMatch, useParams } from 'react-router-dom';
import asciidoctor from 'asciidoctor';

import * as Services from '../../../services';
import { converter } from '../../../services/showdown';
import { I18nContext } from '../../../core';

import 'highlight.js/styles/monokai.css';
import { IApi, IDocDetail, IDocPage, IDocumentationPages, isError } from '../../../types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Spinner } from '../../utils';
import classNames from 'classnames';

const asciidoctorConverter = asciidoctor();

type ApiDocumentationCartidgeProps = {
  api: IApi,
  currentPageId: string
}
export const ApiDocumentationCartidge = ({ api, currentPageId }: ApiDocumentationCartidgeProps) => {
  const params = useParams();

  const renderLinks = (pages: IDocumentationPages, level: number = 0) => {
    if (!pages.length) {
      return null;
    } else {
      return (
        <ul>
          {pages.map((page) => {
            return (
              <li className="api-doc-cartridge-link" key={page.id} style={{ marginLeft: level * 10 }}>
                <Link className={classNames({active: page.id === currentPageId})} to={`/${params.teamId}/${params.apiId}/${params.versionId}/documentation/${page.id}`}>
                  {page.title}
                </Link>
                {renderLinks(page.children, level + 1)}
              </li>
            );
          })}
        </ul>
      )
    }
  }


  return (
    <div className="d-flex col-12 col-sm-3 col-md-2 flex-column p-3 text-muted navDocumentation additionalContent">
      {renderLinks(api.documentation.pages)}
    </div>
  );
}

type ApiDocPageProps = {
  api: IApi
  pageId: string
}
const ApiDocPage = (props: ApiDocPageProps) => {
  const queryClient = useQueryClient();
  const pageRequest = useQuery(['page', { pageId: props.pageId }], ({ queryKey }) => {
    const [_key, keys] = queryKey //@ts-ignore
    return Services.getDocPage(props.api._id, keys.pageId)
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
    queryClient.invalidateQueries(['page'])
  }, [props.pageId])


  if (pageRequest.isLoading) {
    return <Spinner />
  } else if (pageRequest.data && !isError(pageRequest.data)) {
    if (isError(pageRequest.data)) {
      return <span>Error while fetching documentation page: {pageRequest.data.error}</span>
    } else if (pageRequest.data.remoteContentEnabled) {
      return (
        <AwesomeContentViewer contentType={pageRequest.data.contentType} remoteContent={{ url: pageRequest.data.remoteContentUrl! }} />
      )
    } else {
      return (
        <AwesomeContentViewer contentType={pageRequest.data.contentType} content={pageRequest.data.content} />
      )
    }
  } else {
    return <span>Error while fetching documentation page</span>
  }


}

type ApiDocumentationProps = {
  api: IApi
}
export function ApiDocumentation(props: ApiDocumentationProps) {
  const { Translation } = useContext(I18nContext);

  const params = useParams();
  const match = useMatch('/:teamId/:apiId/:version/documentation/:pageId')

  const pageId = match?.params.pageId || props.api.documentation.pages[0].id;

  const flattenDoc = (pages: IDocumentationPages): Array<string> => {
    return pages.flatMap(p => [p.id, ...flattenDoc(p.children)])
  }

  const orderedPages = flattenDoc(props.api.documentation.pages)

  const idx = orderedPages.findIndex(p => p === pageId)
  const next = orderedPages[idx + (pageId ? 1 : 2)];
  const prev = orderedPages[idx - 1];

  return (<>
    <ApiDocumentationCartidge api={props.api} currentPageId={pageId}/>
    <div className="col p-3 d-flex flex-column">
      <div className={classNames("d-flex", {
        'justify-content-between': !!prev,
        'justify-content-end': !prev,
      })}>
        {prev && (<Link to={`/${params.teamId}/${props.api._humanReadableId}/${props.api.currentVersion}/documentation/${prev}`}>
          <i className="fas fa-chevron-left me-1" />
          <Translation i18nkey="Previous page">Previous page</Translation>
        </Link>)}
        {next && (<Link to={`/${params.teamId}/${props.api._humanReadableId}/${props.api.currentVersion}/documentation/${next}`}>
          <Translation i18nkey="Next page">Next page</Translation>
          <i className="fas fa-chevron-right ms-1" />
        </Link>)}
      </div>
      <ApiDocPage api={props.api} pageId={pageId} />
      {/* <div className="d-flex" style={{ justifyContent: prevId ? 'space-between' : 'flex-end' }}>
        {prevId && (<Link to={`/${params.teamId}/${apiId}/${versionId}/documentation/${prevId}`}>
          <i className="fas fa-chevron-left me-1" />
          <Translation i18nkey="Previous page">Previous page</Translation>
        </Link>)}
        {nextId && (<Link to={`/${params.teamId}/${apiId}/${versionId}/documentation/${nextId}`}>
          <Translation i18nkey="Next page">Next page</Translation>
          <i className="fas fa-chevron-right ms-1" />
        </Link>)} */}
    </div >
  </>);
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
];

type AwesomeContentViewerProp = {
  contentType: string
  remoteContent?: { url: string }
  content?: string
}
const AwesomeContentViewer = (props: AwesomeContentViewerProp) => {
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
