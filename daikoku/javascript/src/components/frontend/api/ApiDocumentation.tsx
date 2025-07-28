/* eslint-disable react/display-name */
import { constraints, Flow, Form, format, Schema, type } from '@maif/react-forms';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import asciidoctor from 'asciidoctor';
import classNames from 'classnames';
import hljs from 'highlight.js';
import { useContext, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Select from 'react-select';
import { toast } from 'sonner';


import { I18nContext, ModalContext } from '../../../contexts';
import { AssetChooserByModal, MimeTypeFilter } from '../../../contexts/modals/AssetsChooserModal';
import * as Services from '../../../services';
import { converter } from '../../../services/showdown';
import { IApi, ICmsPageGQL, IDocPage, IDocumentation, IDocumentationPages, isApi, isError, isUsagePlan, ITeamSimple, IUsagePlan, IWithDocumentation, ResponseError } from '../../../types';
import { AssetButton, longLoremIpsum, loremIpsum, TeamApiDocumentation } from '../../backoffice/apis/TeamApiDocumentation';
import { api as API, BeautifulTitle, Can, manage, Spinner } from '../../utils';
import { CmsViewer } from '../CmsViewer';

import 'highlight.js/styles/monokai.css';
import { GlobalContext } from '../../../contexts/globalContext';

type ApiDocumentationProps<T extends IWithDocumentation> = {
  documentation?: IDocumentation
  getDocPage: (pageId: string) => Promise<IDocPage | ResponseError>
  ownerTeam: ITeamSimple
  entity: T,
  api: IApi,
  refreshEntity: () => void,
  savePages: (pages: IDocumentationPages) => void
}

type ApiDocumentationCartidgeProps = {
  documentation?: IDocumentation
  currentPageId?: string
  goTo: (pageId: string) => void
}

type ApiDocPageProps = {
  pageId?: string,
  api: IApi,
  getDocPage: (id: string) => Promise<IDocPage | ResponseError>
}

type AwesomeContentViewerProp = {
  contentType: string
  remoteContent?: { url: string }
  content?: string
  cmsPage?: string
  api: IApi,
  page: IDocPage
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
          remoteContent={{ url: pageRequest.data.remoteContentUrl! }}
          page={pageRequest.data} />
      )
    } else {
      return (
        <AwesomeContentViewer
          api={props.api}
          cmsPage={pageRequest.data.cmsPage}
          contentType={pageRequest.data.contentType}
          content={pageRequest.data.content}
          page={pageRequest.data} />
      )
    }
  } else {
    return <span>Error while fetching documentation page</span>
  }


}

export const ApiDocumentation = <T extends IWithDocumentation>(props: ApiDocumentationProps<T>) => {
  const { Translation, translate } = useContext(I18nContext);
  const { openRightPanel, openApiDocumentationSelectModal, closeRightPanel } = useContext(ModalContext);
  const { customGraphQLClient } = useContext(GlobalContext);

  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<'documentation' | 'update'>(() => {
    return (localStorage.getItem('view') as 'documentation' | 'update') || 'documentation';
  });

  useEffect(() => {
    localStorage.setItem('view', view);
  }, [view]);


  const [pageId, setPageId] = useState(searchParams.get('page') || props.documentation?.pages[0]?.id);


  const getCmsPages = (): Promise<Array<ICmsPageGQL>> =>
    customGraphQLClient.request<{ pages: Array<ICmsPageGQL> }>(Services.graphql.cmsPages)
      .then(res => res.pages)

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

  useEffect(() => {
    setPageId(props.documentation?.pages[0]?.id)
  }, [props.documentation])



  const orderedPages = flattenDoc(props.documentation?.pages)

  const idx = orderedPages.findIndex(p => p === pageId)
  const next = orderedPages[idx + (pageId ? 1 : 2)];
  const prev = orderedPages[idx - 1];

  const flow: Flow = [
    'title',
    'contentType',
    'cmsPage',
    'remoteContentEnabled',
    'remoteContentUrl',
    'remoteContentHeaders',
    'content',
  ];

  const schema = (onSubmitAsset: (page: IDocPage) => void): Schema => {
    return {
      title: {
        type: type.string,
        label: translate('Page title'),
        constraints: [
          constraints.required(translate("constraints.required.name"))
        ]
      },
      content: {
        type: type.string,
        format: format.markdown,
        visible: ({
          rawValues
        }) => !rawValues.remoteContentEnabled && rawValues.contentType !== 'cms/page',
        label: translate('Page content'),
        props: {
          height: '800px',
          actions: (insert) => {
            return <>
              <button
                type="button"
                className="btn-for-descriptionToolbar"
                aria-label={translate('Lorem Ipsum')}
                title={translate('Lorem Ipsum')}
                onClick={() => insert(loremIpsum)}
              >
                <i className={`fas fa-feather-alt`} />
              </button>
              <button
                type="button"
                className="btn-for-descriptionToolbar"
                aria-label={translate('Long Lorem Ipsum')}
                title={translate('Long Lorem Ipsum')}
                onClick={() => insert(longLoremIpsum)}
              >
                <i className={`fas fa-feather`} />
              </button>
              <BeautifulTitle
                place="bottom"
                title={translate('image url from asset')}
              >
                <AssetChooserByModal
                  typeFilter={MimeTypeFilter.image}
                  onlyPreview
                  tenantMode={false}
                  team={props.ownerTeam}
                  icon="fas fa-file-image"
                  classNames="btn-for-descriptionToolbar"
                  onSelect={(asset) => insert(asset.link)}
                  label={translate("Insert URL")}
                />
              </BeautifulTitle>
            </>;
          }
        }
      },
      remoteContentEnabled: {
        type: type.bool,
        label: translate('Remote content'),
        visible: ({
          rawValues
        }) => rawValues.contentType !== 'cms/page',
      },
      contentType: {
        type: type.string,
        format: format.select,
        label: translate('Content type'),
        options: mimeTypes,
      },
      remoteContentUrl: {
        type: type.string,
        visible: ({
          rawValues
        }) => !!rawValues.remoteContentEnabled && rawValues.contentType !== 'cms/page',
        label: translate('Content URL'),
        render: ({
          onChange,
          value,
          setValue,
          rawValues
        }: any) => {
          return (
            <div className='flex-grow-1 ms-3'>
              <input className='mrf-input mb-3' value={value} onChange={onChange} />
              <div className="col-12 d-flex justify-content-end">
                <AssetButton onChange={onChange} team={props.ownerTeam} setValue={setValue} rawValues={rawValues} formModalProps={{
                  title: translate('doc.page.update.modal.title'),
                  flow: flow,
                  schema: schema(onSubmitAsset),
                  value: rawValues,
                  onSubmit: onSubmitAsset,
                  actionLabel: translate('Save')
                }} />
              </div>
            </div>
          )
        }
      },
      cmsPage: {
        type: type.string,
        format: format.select,
        label: translate('CMS Page'),
        props: { isClearable: true },
        optionsFrom: () => {
          return getCmsPages()
            .then(results => results
              .filter(result => result.path.includes('documentations/'))
              .sort((a, b) => a.path.includes(props.api._humanReadableId) ? 1 : b.path.includes(props.api._humanReadableId) ? 1 : -1))
        },
        transformer: page => ({
          label: `${page.path}/${page.name}`,
          value: page.id
        }),
        visible: ({
          rawValues
        }: any) => rawValues.contentType === 'cms/page',
      },
      remoteContentHeaders: {
        type: type.object,
        visible: ({
          rawValues
        }: any) => !!rawValues.remoteContentEnabled && rawValues.contentType !== 'cms/page',
        label: translate('Content headers'),
      },
    }
  };

  const saveNewPage = (page: IDocPage) => {
    Services.createDocPage(props.ownerTeam._id, page)
      .then(() => props.savePages([{
        id: page._id,
        title: page.title,
        children: []
      }]))
      .then(props.refreshEntity)
      .then(closeRightPanel)
  }

  const fetchNewPageAndUpdate = () => {
    Services.fetchNewApiDocPage()
      .then(page => {
        openRightPanel({
          title: translate("doc.page.create.modal.title"),
          content: <Form
            schema={schema(asset => console.debug({ asset }))}
            flow={flow}
            onSubmit={saveNewPage}
            value={page}
          />
        })
      })
  }


  return (
    <div className="d-flex col flex-column p-3 section" style={{ position: 'relative' }}>
      <Can I={manage} a={API} team={props.ownerTeam}>
        <button
          className="btn btn-sm btn-outline-primary px-3"
          aria-label={translate("api.home.config.api.aria.label")}
          style={{ position: "absolute", right: 0, top: 0 }}
          onClick={() => setView(view === 'documentation' ? 'update' : 'documentation')}>
          {view === 'documentation' ? translate('api.home.config.api.documentation.btn.label.edit') : translate('api.home.config.api.documentation.btn.label.view')}
        </button>
      </Can>

      {view === 'documentation' && pageId && (
        <div className='d-flex flex-row'>
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
            <ApiDocPage pageId={pageId} getDocPage={props.getDocPage} api={props.api} />
          </div >
        </div>
      )}

      {view === 'documentation' && !pageId && (
        <Can I={manage} a={API} team={props.ownerTeam}>
          <div className={`alert alert-info col-6 text-center mx-auto`} role='alert'>
            <div>{translate('update.api.documentation.not.found.alert')}</div>
            <button className="btn btn-outline-info"
              onClick={() => fetchNewPageAndUpdate()}>
              {translate('add.api.documention.btn.label')}
            </button>
          </div>
        </Can>
      )}

      {view === 'update' && (
        <TeamApiDocumentation
          creationInProgress={false}
          team={props.ownerTeam}
          api={props.api}
          //todo: passer le callback en props c'est plus simple
          onSave={documentation => isUsagePlan(props.entity) ?
            Services.updatePlan(props.ownerTeam._id, props.api._id, props.api.currentVersion, { ...props.entity, documentation }) :
            Services.saveTeamApiWithId(
              props.ownerTeam!._id,
              { ...props.api, documentation },
              props.api.currentVersion,
              props.api._humanReadableId
            )}
          reloadState={() => Promise.resolve(props.refreshEntity())}
          documentation={props.entity.documentation!}
          importPage={() => openApiDocumentationSelectModal({
            api: props.api,
            teamId: props.ownerTeam._id,
            onClose: () => {
              toast.success(translate('doc.page.import.successfull'));
              props.refreshEntity()
            },
            getDocumentationPages: () => Services.getAllApiDocumentation(props.ownerTeam._id, props.api._id, props.api.currentVersion),
            importPages: (pages: Array<string>, linked?: boolean) => Services.importApiPages(props.ownerTeam._id, props.api._id, pages, props.api.currentVersion, linked)
          })}
          importAuthorized={isApi(props.entity)}
        />
      )}
    </div>
  )
}

const TypeNotSupportedYet = () => <h3>Content type not supported yet !</h3>;
const Image = (props: RenderProps) => <img src={props.page.remoteContentUrl ?? ''} style={{ width: '100%' }} alt={props.page.title} />;
const Video = (props: RenderProps) => <video controls style={{ width: '100%' }} >
  <source src={props.page.remoteContentUrl ?? ''} type="video/webm" />
</video>;
const Pdf = (props: RenderProps) => {
  return (
    <object className=""
      data={props.page.remoteContentUrl ?? ''}
      style={{ width: '100%', height: '100vh', border: 0 }}
    >
    </object>
  )
};

type MarkdownProps = { api: IApi, page: IDocPage }
function Markdown(props: MarkdownProps) {
  const [content, setContent] = useState<string>();

  useEffect(() => {
    if (props.page.remoteContentUrl) update();
  }, [props.page]);

  useEffect(() => {
    if (content)
      (window as any).$('pre code').each((i: any, block: any) => {
        hljs.highlightElement(block);
      });
  }, [content]);

  const update = () => {
    Services.getApiDocPageRemoteContent(props.api._id, props.page._id)
      .then((r) => r.text())
      .then(setContent);
  };

  if (!props.page.content && !content) {
    return null;
  }
  return (
    <div
      className="api-description"
      dangerouslySetInnerHTML={{
        // __html: converter.makeHtml(props.page.content || content),
        __html: converter.makeHtml(props.page.remoteContentEnabled ? content : props.page.content),
      }}
    />
  );
}

function Asciidoc(props: RenderProps) {
  const [content, setContent] = useState<string>();

  useEffect(() => {
    if (props.page.remoteContentUrl) update();
  }, [props.page]);

  useEffect(() => {
    if (content)
      (window as any).$('pre code').each((i: any, block: any) => {
        hljs.highlightElement(block);
      });
  }, [content]);

  const update = () => {
    Services.getApiDocPageRemoteContent(props.api._id, props.page._id)
      .then((r) => r.text())
      .then(setContent);
  };

  if (!props.page.content && !content) {
    return null;
  }
  const asciidoctorConverter = asciidoctor();
  return (
    <div
      className="api-description asciidoc"
      style={{ width: "66%", overflow: "scroll" }}
      dangerouslySetInnerHTML={{
        __html: asciidoctorConverter.convert((props.page.remoteContentEnabled ? content : props.page.content) ?? '') as string,
      }}
    />
  );
}

function OpenDocument(props: RenderProps) {
  console.log(
    `${window.location.origin}/assets/viewerjs/index.html#${window.location.origin}${props.page.remoteContentHeaders}`
  );
  return (
    <iframe
      src={`/assets/viewerjs/index.html#${props.page.remoteContentUrl}`}
      style={{ width: '100%', height: '100vh', border: 0 }}
    />
  );
}

type RenderProps = { api: IApi, page: IDocPage }
const mimeTypes = [
  {
    label: '.adoc Ascii doctor',
    value: 'text/asciidoc',
    render: ({ api, page }: RenderProps) => <Asciidoc api={api} page={page} />,
  },
  {
    label: '.avi Audio Video Interleaved file',
    value: 'video/x-msvideo',
    render: ({ api, page }: RenderProps) => <Video api={api} page={page} />,
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
    render: ({ api, page }: RenderProps) => <Image api={api} page={page} />,
  },
  {
    label: '.html HyperText Markup Language file',
    value: 'text/html',
    render: ({ api, page }: RenderProps) => <Markdown api={api} page={page} />,
  },
  {
    label: '.jpg JPEG image',
    value: 'image/jpeg',
    render: ({ api, page }: RenderProps) => <Image api={api} page={page} />
  },
  {
    label: '.md	Markdown file',
    value: 'text/markdown',
    render: ({ api, page }: RenderProps) => <Markdown api={api} page={page} />,
  },
  {
    label: '.mpeg	MPEG video file ',
    value: 'video/mpeg',
    render: ({ api, page }: RenderProps) => <Video api={api} page={page} />
  },
  {
    label: '.odp OpenDocument presentation document ',
    value: 'application/vnd.oasis.opendocument.presentation',
    render: ({ api, page }: RenderProps) => <OpenDocument api={api} page={page} />,
  },
  {
    label: '.ods OpenDocument spreadsheet document ',
    value: 'application/vnd.oasis.opendocument.spreadsheet',
    render: ({ api, page }: RenderProps) => <OpenDocument api={api} page={page} />,
  },
  {
    label: '.odt OpenDocument text document ',
    value: 'application/vnd.oasis.opendocument.text',
    render: ({ api, page }: RenderProps) => <OpenDocument api={api} page={page} />,
  },
  {
    label: '.png Portable Network Graphics',
    value: 'image/png',
    render: ({ api, page }: RenderProps) => <Image api={api} page={page} />,
  },
  {
    label: '.pdf Adobe Portable Document Format (PDF)',
    value: 'application/pdf',
    render: ({ api, page }: RenderProps) => <Pdf api={api} page={page} />,
  },
  {
    label: '.webm WEBM video file ',
    value: 'video/webm',
    render: ({ api, page }: RenderProps) => <Video api={api} page={page} />
  },
  {
    label: '.cms : Page from CMS',
    value: 'cms/page',
    render: ({ api, page }: RenderProps) => {
      return page.remoteContentUrl
    }
  },
];


const AwesomeContentViewer = (props: AwesomeContentViewerProp) => {

  if (props.cmsPage) {
    return <CmsViewer pageId={props.cmsPage} fields={{ api: props.api }} />
  }

  const mimeType = mimeTypes.filter((t) => t.value === props.contentType)[0] || {
    render: () => <TypeNotSupportedYet />,
  };
  if (props.remoteContent) {
    return mimeType.render({ api: props.api, page: props.page });
  } else if (props.content) {
    return mimeType.render({ api: props.api, page: props.page });
  } else {
    return <TypeNotSupportedYet />;
  }
};

type EnvironmentsDocumentationProps = {
  api: IApi
  ownerTeam: ITeamSimple
}
export const EnvironmentsDocumentation = (props: EnvironmentsDocumentationProps) => {
  const { translate } = useContext(I18nContext);

  const [selectedEnvironment, setSelectedEnvironment] = useState<IUsagePlan>()

  const queryClient = useQueryClient();
  const environmentsQuery = useQuery({
    queryKey: ['environments', props.api._id],
    queryFn: () => Services.getVisiblePlans(props.api._id, props.api.currentVersion)
      .then(envs => {
        if (isError(envs)) {
          return []
        } else {
          setSelectedEnvironment(prev => !!prev ? envs.find(e => selectedEnvironment?._id === e._id) : envs.find(e => !!e.documentation) || envs[0])
          return envs
        }
      }),
  })

  const saveEnvironmentDocumentation = (pages: IDocumentationPages) => {
    if (selectedEnvironment && selectedEnvironment.documentation) {
      return Services.updatePlan(props.ownerTeam._id, props.api._id, props.api.currentVersion,
        { ...selectedEnvironment, documentation: { ...selectedEnvironment.documentation, pages } })
    } else if (selectedEnvironment) {
      return Services.fetchNewApiDoc()
        .then(documentation => Services.updatePlan(props.ownerTeam._id, props.api._id, props.api.currentVersion,
          { ...selectedEnvironment, documentation: { ...documentation, pages } }))
    }
  }

  if (!selectedEnvironment && environmentsQuery.isLoading) {
    return <Spinner />
  } else if (selectedEnvironment && environmentsQuery.data) {
    const environments: IUsagePlan[] = environmentsQuery.data

    return (
      <div className='d-flex flex-column p-3'>
        <Select
          className='col-3 mb-3'
          placeholder={translate('api.subscriptions.team.select.placeholder')}
          options={environments.map(value => ({ label: value.customName, value }))}
          onChange={t => setSelectedEnvironment(t!.value)}
          value={{ label: selectedEnvironment.customName, value: selectedEnvironment }}
          styles={{
            valueContainer: (baseStyles) => ({
              ...baseStyles,
              display: 'flex'
            }),
          }}
          components={{
            IndicatorSeparator: () => null,
            SingleValue: (props) => {
              return <div className='d-flex align-items-center m-0' style={{
                gap: '.5rem'
              }}>
                <span className={`badge badge-custom`}>
                  {'ENV'}
                </span>{props.data.label}
              </div>
            }
          }} />


        <ApiDocumentation
          entity={selectedEnvironment}
          ownerTeam={props.ownerTeam}
          api={props.api}
          documentation={selectedEnvironment.documentation}
          getDocPage={(pageId) => Services.getUsagePlanDocPage(props.api._id, selectedEnvironment._id, pageId)}
          refreshEntity={() => queryClient.invalidateQueries({ queryKey: ['environments'] })}
          savePages={(pages) => saveEnvironmentDocumentation(pages)} />
      </div>
    )
  } else {
    return <div>An error occured while fetching environments </div>
  }
}
