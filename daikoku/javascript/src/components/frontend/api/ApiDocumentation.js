/* eslint-disable react/display-name */
import React, { Component } from 'react';
import _ from 'lodash';
import hljs from 'highlight.js';
import { Link } from 'react-router-dom';
import asciidoctor from 'asciidoctor';

import * as Services from '../../../services';
import { converter } from '../../../services/showdown';
import { t, Translation } from '../../../locales';

import 'highlight.js/styles/monokai.css';

const asciidoctorConverter = asciidoctor();

export class ApiDocumentationCartidge extends Component {
  render() {
    const apiId = this.props.match.params.apiId;
    return (
      <div className="d-flex col-12 col-sm-3 col-md-2 flex-column p-3 text-muted navDocumentation additionalContent">
        <ul>
          {this.props.details.titles.map((obj) => {
            return (
              <li key={obj._id} style={{ marginLeft: obj.level * 10 }}>
                <Link
                  to={`/${this.props.match.params.teamId}/${apiId}/documentation/${obj._humanReadableId}`}>
                  {obj.title}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }
}

export class ApiDocumentation extends Component {
  state = {
    details: null,
    content: t('Loading page ...', this.props.currentLanguage),
  };

  fetchPage = () => {
    Services.getDocDetails(this.props.api._id).then((details) => {
      this.setState({ details });
      const pageId = this.props.match.params.pageId || details.pages[0];
      Services.getDocPage(this.props.api._id, pageId).then((page) => {
        if (page.remoteContentEnabled) {
          this.setState({
            content: null,
            contentType: page.contentType,
            remoteContent: {
              url: page.contentUrl,
            },
          });
        } else {
          this.setState({
            content: page.content,
            contentType: page.contentType,
            remoteContent: null,
          });
          window.$('pre code').each((i, block) => {
            hljs.highlightBlock(block);
          });
        }
      });
    });
  };

  componentDidMount() {
    if (this.props.api) {
      this.fetchPage();
    }
  }

  UNSAFE_componentWillReceiveProps(next) {
    if (!this.props.api && next.api) {
      this.fetchPage();
    }
    if (this.props.match && !this.props.match.params.pageId !== next.match.params.pageId) {
      this.fetchPage();
    }
  }

  render() {
    const api = this.props.api;
    if (!api || !this.state.details) {
      return null;
    }
    const details = this.state.details;
    const apiId = this.props.match.params.apiId;
    const pageId = this.props.match.params.pageId;
    const idx = _.findIndex(details.pages, (p) => p === pageId);
    let prevId = null;
    let nextId = null;
    const next = details.pages[idx + (pageId ? 1 : 2)];
    const prev = details.pages[idx - 1];
    if (next) nextId = next;
    if (prev) prevId = prev;
    return (
      <>
        {details && (
          <ApiDocumentationCartidge
            details={details}
            fetchPage={this.fetchPage}
            match={this.props.match}
          />
        )}
        <div className="col p-3">
          <div className="d-flex" style={{ justifyContent: prevId ? 'space-between' : 'flex-end' }}>
            {prevId && (
              <Link to={`/${this.props.match.params.teamId}/${apiId}/documentation/${prevId}`}>
                <i className="fas fa-chevron-left" />
                <Translation i18nkey="Previous page" language={this.props.currentLanguage}>
                  Previous page
                </Translation>
              </Link>
            )}
            {nextId && (
              <Link to={`/${this.props.match.params.teamId}/${apiId}/documentation/${nextId}`}>
                <Translation i18nkey="Next page" language={this.props.currentLanguage}>
                  Next page
                </Translation>
                <i className="fas fa-chevron-right" />
              </Link>
            )}
          </div>
          {/*!this.state.remoteContent && <div
            ref={r => (this.doc = r)}
            className="api-description"
            dangerouslySetInnerHTML={{ __html: converter.makeHtml(this.state.content) }}
          />*/}
          {!this.state.remoteContent && (
            <AwesomeContentViewer
              contentType={this.state.contentType}
              content={this.state.content}
            />
          )}
          {this.state.remoteContent && (
            <AwesomeContentViewer
              contentType={this.state.contentType}
              remoteContent={this.state.remoteContent}
            />
          )}
          <div className="d-flex" style={{ justifyContent: prevId ? 'space-between' : 'flex-end' }}>
            {prevId && (
              <Link to={`/${this.props.match.params.teamId}/${apiId}/documentation/${prevId}`}>
                <i className="fas fa-chevron-left" />
                <Translation i18nkey="Previous page" language={this.props.currentLanguage}>
                  Previous page
                </Translation>
              </Link>
            )}
            {nextId && (
              <Link to={`/${this.props.match.params.teamId}/${apiId}/documentation/${nextId}`}>
                <Translation i18nkey="Next page" language={this.props.currentLanguage}>
                  Next page
                </Translation>
                <i className="fas fa-chevron-right" />
              </Link>
            )}
          </div>
        </div>
      </>
    );
  }
}

const TypeNotSupportedYet = () => <h3>Content type not supported yet !</h3>;
const Image = (props) => <img src={props.url} style={{ width: '100%' }} alt={props.alt} />;
const Video = (props) => <video src={props.url} style={{ width: '100%' }} />;
const Html = (props) => (
  <iframe src={props.url} style={{ width: '100%', height: '100vh', border: 0 }} />
);

class Pdf extends Component {
  render() {
    return <iframe src={this.props.url} style={{ width: '100%', height: '100vh', border: 0 }} />;
  }
}

class Markdown extends Component {
  state = { content: null };

  componentDidMount() {
    if (this.props.url) {
      this.update(this.props.url);
    }
  }

  UNSAFE_componentWillReceiveProps(np) {
    if (np.url && np.url !== this.props.url) {
      this.update(np.url);
    }
  }

  update = (url) => {
    fetch(url, {
      method: 'GET',
      credentials: 'include',
    })
      .then((r) => r.text())
      .then((content) =>
        this.setState({ content }, () => {
          window.$('pre code').each((i, block) => {
            hljs.highlightBlock(block);
          });
        })
      );
  };

  render() {
    if (!this.props.content && !this.state.content) {
      return null;
    }
    return (
      <div
        className="api-description"
        dangerouslySetInnerHTML={{
          __html: converter.makeHtml(this.props.content || this.state.content),
        }}
      />
    );
  }
}

class Asciidoc extends Component {
  state = { content: null };

  componentDidMount() {
    if (this.props.url) {
      this.update(this.props.url);
    }
  }

  UNSAFE_componentWillReceiveProps(np) {
    if (np.url && np.url !== this.props.url) {
      this.update(np.url);
    }
  }

  update = (url) => {
    fetch(url, {
      method: 'GET',
      credentials: 'include',
    })
      .then((r) => r.text())
      .then((content) =>
        this.setState({ content }, () => {
          window.$('pre code').each((i, block) => {
            hljs.highlightBlock(block);
          });
        })
      );
  };

  render() {
    if (!this.props.content && !this.state.content) {
      return null;
    }
    return (
      <div
        className="api-description asciidoc"
        dangerouslySetInnerHTML={{
          __html: asciidoctorConverter.convert(this.props.content || this.state.content),
        }}
      />
    );
  }
}

class OpenDocument extends Component {
  render() {
    console.log(
      `${window.location.origin}/assets/viewerjs/index.html#${window.location.origin}${this.props.url}`
    );
    return (
      <iframe
        src={`/assets/viewerjs/index.html#${this.props.url}`}
        style={{ width: '100%', height: '100vh', border: 0 }}
      />
    );
  }
}

const mimeTypes = [
  {
    label: '.adoc Ascii doctor',
    value: 'text/asciidoc',
    render: (url, content) => <Asciidoc url={url} content={content} />,
  },
  {
    label: '.avi Audio Video Interleaved file',
    value: 'video/x-msvideo',
    render: (url) => <Video url={url} />,
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
    render: (url) => <Image url={url} />,
  },
  {
    label: '.html HyperText Markup Language file',
    value: 'text/html',
    render: (url) => <Html url={url} />,
  },
  { label: '.jpg JPEG image', value: 'image/jpeg', render: (url) => <Image url={url} /> },
  {
    label: '.md	Markown file',
    value: 'text/markdown',
    render: (url, content) => <Markdown url={url} content={content} />,
  },
  { label: '.mpeg	MPEG video file ', value: 'video/mpeg', render: (url) => <Video url={url} /> },
  {
    label: '.odp OpenDocument presentation document ',
    value: 'application/vnd.oasis.opendocument.presentation',
    render: (url) => <OpenDocument url={url} />,
  },
  {
    label: '.ods OpenDocument spreadsheet document ',
    value: 'application/vnd.oasis.opendocument.spreadsheet',
    render: (url) => <OpenDocument url={url} />,
  },
  {
    label: '.odt OpenDocument text document ',
    value: 'application/vnd.oasis.opendocument.text',
    render: (url) => <OpenDocument url={url} />,
  },
  {
    label: '.png Portable Network Graphics',
    value: 'image/png',
    render: (url) => <Image url={url} />,
  },
  {
    label: '.pdf Adobe Portable Document Format (PDF)',
    value: 'application/pdf',
    render: (url) => <Pdf url={url} />,
  },
  { label: '.webm WEBM video file ', value: 'video/webm', render: (url) => <Video url={url} /> },
];

class AwesomeContentViewer extends Component {
  render() {
    const mimeType = mimeTypes.filter((t) => t.value === this.props.contentType)[0] || {
      render: () => <TypeNotSupportedYet />,
    };
    if (this.props.remoteContent) {
      return mimeType.render(this.props.remoteContent.url);
    } else if (this.props.content) {
      return mimeType.render(null, this.props.content);
    } else {
      return <TypeNotSupportedYet />;
    }
  }
}
