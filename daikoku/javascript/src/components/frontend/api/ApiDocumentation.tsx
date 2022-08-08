/* eslint-disable react/display-name */
import React, { useContext, useEffect, useState } from 'react';
import findIndex from 'lodash/findIndex';
import hljs from 'highlight.js';
import { Link, useParams } from 'react-router-dom';
import asciidoctor from 'asciidoctor';

import * as Services from '../../../services';
import { converter } from '../../../services/showdown';
import { I18nContext } from '../../../core';

import 'highlight.js/styles/monokai.css';

const asciidoctorConverter = asciidoctor();

export function ApiDocumentationCartidge({
  details
}: any) {
  const params = useParams();
  return (
    <div className="d-flex col-12 col-sm-3 col-md-2 flex-column p-3 text-muted navDocumentation additionalContent">
      <ul>
        {details.titles.map((obj: any) => {
          return (
            <li key={obj._id} style={{ marginLeft: obj.level * 10 }}>
              <Link
                to={`/${params.teamId}/${params.apiId}/${params.versionId}/documentation/${obj._id}`}
              >
                {obj.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ApiDocumentation(props: any) {
  const { translateMethod, Translation } = useContext(I18nContext);

  const params = useParams();

  const [state, setState] = useState<any>({
    details: null,
    content: translateMethod('Loading page ...'),
  });

  useEffect(() => {
    if (state.content)
      (window as any).$('pre code').each((i: any, block: any) => {
        hljs.highlightElement(block);
      });
  }, [state.content]);

  useEffect(() => {
    fetchPage();
  }, [props.api, params.pageId]);

  const fetchPage = () => {
    Services.getDocDetails(props.api._humanReadableId, props.api.currentVersion).then((details) => {
      const pageId = params.pageId || details.pages[0];
      if (pageId) {
        Services.getDocPage(props.api._id, pageId).then((page) => {
          if (page.remoteContentEnabled) {
            setState({
              ...state,
              details,
              content: null,
              contentType: page.contentType,
              remoteContent: {
                url: page.contentUrl,
              },
            });
          } else
            setState({
              ...state,
              details,
              content: page.content,
              contentType: page.contentType,
              remoteContent: null,
            });
        });
      } else {
        setState({ ...state, details });
      }
    });
  };

  const api = props.api;

  if (!api || !state.details) {
    return null;
  }

  const details = state.details;
  const apiId = params.apiId;
  const pageId = params.pageId;
  const versionId = params.versionId;
  const idx = findIndex((details as any).pages, (p) => p === pageId);

  let prevId = null;
  let nextId = null;

  const next = (details as any).pages[idx + (pageId ? 1 : 2)];
  const prev = (details as any).pages[idx - 1];
  if (next) nextId = next;
  if (prev) prevId = prev;

  return (<>
    {details && <ApiDocumentationCartidge details={details} />}
    <div className="col p-3">
      <div className="d-flex" style={{ justifyContent: prevId ? 'space-between' : 'flex-end' }}>
        {prevId && (<Link to={`/${params.teamId}/${apiId}/${versionId}/documentation/${prevId}`}>
          <i className="fas fa-chevron-left me-1" />
          <Translation i18nkey="Previous page">Previous page</Translation>
        </Link>)}
        {nextId && (<Link to={`/${params.teamId}/${apiId}/${versionId}/documentation/${nextId}`}>
          <Translation i18nkey="Next page">Next page</Translation>
          <i className="fas fa-chevron-right ms-1" />
        </Link>)}
      </div>
      {!(state as any).remoteContent && (<AwesomeContentViewer contentType={(state as any).contentType} content={state.content} />)}
      {(state as any).remoteContent && (<AwesomeContentViewer contentType={(state as any).contentType} remoteContent={(state as any).remoteContent} />)}
      <div className="d-flex" style={{ justifyContent: prevId ? 'space-between' : 'flex-end' }}>
        {prevId && (<Link to={`/${params.teamId}/${apiId}/${versionId}/documentation/${prevId}`}>
          <i className="fas fa-chevron-left me-1" />
          <Translation i18nkey="Previous page">Previous page</Translation>
        </Link>)}
        {nextId && (<Link to={`/${params.teamId}/${apiId}/${versionId}/documentation/${nextId}`}>
          <Translation i18nkey="Next page">Next page</Translation>
          <i className="fas fa-chevron-right ms-1" />
        </Link>)}
      </div>
    </div>
  </>);
}

const TypeNotSupportedYet = () => <h3>Content type not supported yet !</h3>;
const Image = (props: any) => <img src={props.url} style={{ width: '100%' }} alt={props.alt} />;
const Video = (props: any) => <video src={props.url} style={{ width: '100%' }} />;
const Html = (props: any) => <iframe src={props.url} style={{ width: '100%', height: '100vh', border: 0 }} />;

const Pdf = ({
  url
}: any) => {
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
    label: '.md	Markown file',
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

const AwesomeContentViewer = (props: any) => {
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
