import { constraints, Flow, format, Schema, type } from '@maif/react-forms';
import { useQueryClient } from '@tanstack/react-query';
import { nanoid } from 'nanoid';
import { useContext } from 'react';
import { useSelector } from 'react-redux';
import { toast } from 'sonner';

import { IFormModalProps, ModalContext } from '../../../contexts';
import { AssetChooserByModal, MimeTypeFilter } from '../../../contexts/modals/AssetsChooserModal';
import { I18nContext } from '../../../core';
import * as Services from '../../../services';
import { IApi, IAsset, IDocPage, IDocumentation, IDocumentationPage, IDocumentationPages, isError, IState, ITeamSimple, ITenant } from '../../../types';
import { BeautifulTitle } from '../../utils';
import { SortableTree } from '../../utils/dnd/SortableTree';
import { Wrapper } from '../../utils/dnd/Wrapper';

const mimeTypes = [
  { label: '.adoc Ascii doctor', value: 'text/asciidoc' },
  { label: '.avi	AVI : Audio Video Interleaved', value: 'video/x-msvideo' },
  // { label: '.doc	Microsoft Word', value: 'application/msword' },
  // {
  //   label: '.docx	Microsoft Word (OpenXML)',
  //   value: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  // },
  { label: '.gif	fichier Graphics Interchange Format (GIF)', value: 'image/gif' },
  { label: '.html	fichier HyperText Markup Language (HTML)', value: 'text/html' },
  { label: '.jpg	image JPEG', value: 'image/jpeg' },
  { label: '.md	Markdown file', value: 'text/markdown' },
  { label: '.mpeg	vidéo MPEG', value: 'video/mpeg' },
  {
    label: '.odp OpenDocument presentation document ',
    value: 'application/vnd.oasis.opendocument.presentation',
  },
  {
    label: '.ods OpenDocument spreadsheet document ',
    value: 'application/vnd.oasis.opendocument.spreadsheet',
  },
  {
    label: '.odt OpenDocument text document ',
    value: 'application/vnd.oasis.opendocument.text',
  },
  { label: '.png	fichier Portable Network Graphics', value: 'image/png' },
  { label: '.pdf	Adobe Portable Document Format (PDF)', value: 'application/pdf' },
  { label: '.webm fichier vidéo WEBM', value: 'video/webm' },
  { label: '.js fichier javascript', value: 'text/javascript' },
  { label: '.css fichier css', value: 'text/css' },
];

const loremIpsum = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Phasellus gravida convallis leo et aliquet. Aenean venenatis, elit et dignissim scelerisque, urna dui mollis nunc, id eleifend velit sem et ante. Quisque pharetra sed tellus id finibus. In quis porta libero. Nunc egestas eros elementum lacinia blandit. Donec nisi lacus, tristique vel blandit in, sodales eget lacus. Phasellus ultrices magna vel odio vestibulum, a rhoncus nunc ornare. Sed laoreet finibus arcu vitae aliquam. Aliquam quis ex dui.';
const longLoremIpsum = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Phasellus gravida convallis leo et aliquet. Aenean venenatis, elit et dignissim scelerisque, urna dui mollis nunc, id eleifend velit sem et ante. Quisque pharetra sed tellus id finibus. In quis porta libero. Nunc egestas eros elementum lacinia blandit. Donec nisi lacus, tristique vel blandit in, sodales eget lacus. Phasellus ultrices magna vel odio vestibulum, a rhoncus nunc ornare. Sed laoreet finibus arcu vitae aliquam. Aliquam quis ex dui.

Cras ut ultrices quam. Nulla eu purus sed turpis consequat sodales. Aenean vitae efficitur velit, vel accumsan felis. Curabitur aliquam odio dictum urna convallis faucibus. Vivamus eu dignissim lorem. Donec sed hendrerit massa. Suspendisse volutpat, nisi at fringilla consequat, eros lacus aliquam metus, eu convallis nulla mauris quis lacus. Aliquam ultricies, mi eget feugiat vestibulum, enim nunc eleifend nisi, nec tincidunt turpis elit id diam. Nunc placerat accumsan tincidunt. Nulla ut interdum dui. Praesent venenatis cursus aliquet. Nunc pretium rutrum felis nec pharetra.

Vivamus sapien ligula, hendrerit a libero vitae, convallis maximus massa. Praesent ante leo, fermentum vitae libero finibus, blandit porttitor risus. Nulla ac hendrerit turpis. Sed varius velit at libero feugiat luctus. Nunc rhoncus sem dolor, nec euismod justo rhoncus vitae. Vivamus finibus nulla a purus vestibulum sagittis. Maecenas maximus orci at est lobortis, nec facilisis erat rhoncus. Sed tempus leo et est dictum lobortis. Vestibulum rhoncus, nisl ut porta sollicitudin, arcu urna egestas arcu, eget efficitur neque ipsum ut felis. Ut commodo purus quis turpis tempus tincidunt. Donec id hendrerit eros. Vestibulum vitae justo consectetur, egestas nisi ac, eleifend odio.

Donec id mi cursus, volutpat dolor sed, bibendum sapien. Etiam vitae mauris sit amet urna semper tempus vel non metus. Integer sed ligula diam. Aenean molestie ultrices libero eget suscipit. Phasellus maximus euismod eros ut scelerisque. Ut quis tempus metus. Sed mollis volutpat velit eget pellentesque. Integer hendrerit ultricies massa eu tincidunt. Quisque at cursus augue. Sed diam odio, molestie sed dictum eget, efficitur nec nulla. Nullam vulputate posuere nunc nec laoreet. Integer varius sed erat vitae cursus. Vivamus auctor augue enim, a fringilla mauris molestie eget.

Proin vehicula ligula vel enim euismod, sed congue mi egestas. Nullam varius ut felis eu fringilla. Quisque sodales tortor nec justo tristique, sit amet consequat mi tincidunt. Suspendisse porttitor laoreet velit, non gravida nibh cursus at. Pellentesque faucibus, tellus in dapibus viverra, dolor mi dignissim tortor, id convallis ipsum lorem id nisl. Sed id nisi felis. Aliquam in ullamcorper ipsum, vel consequat magna. Donec nec mollis lacus, a euismod elit.`;

type AssetButtonProps = {
  onChange: (value: string) => void,
  team: ITeamSimple,
  setValue: (key: string, value: any) => void,
  rawValues: IDocPage,
  formModalProps: IFormModalProps<IDocPage>
}
const AssetButton = (props: AssetButtonProps) => {
  const { translate } = useContext(I18nContext);
  const { openFormModal } = useContext(ModalContext)



  return (
    <div className="mb-3 row">
      <label className="col-xs-12 col-sm-2 col-form-label" />
      <div
        className="col-sm-10"
        style={{ width: '100%', marginLeft: 0, display: 'flex', justifyContent: 'flex-end' }}
      >
        <AssetChooserByModal
          team={props.team}
          label={translate('Set from asset')}
          onSelect={(asset: IAsset) => {
            openFormModal({
              ...props.formModalProps,
              value: {
                ...props.rawValues,
                contentType: asset.contentType,
                remoteContentUrl: asset.link
              }
            })
          }}
          noClose
        />
      </div>
    </div>
  );
}

type TeamApiDocumentationProps = {
  documentation: IDocumentation
  team: ITeamSimple
  api: IApi
  creationInProgress?: boolean,
  reloadState: () => Promise<void>,
  onSave: (value: IDocumentation) => Promise<any>
  importPage: () => void,
  importAuthorized: boolean
}

export const TeamApiDocumentation = (props: TeamApiDocumentationProps) => {

  const { translate } = useContext(I18nContext);
  const { confirm, openFormModal } = useContext(ModalContext);

  const tenant = useSelector<IState, ITenant>(s => s.context.tenant)

  const queryClient = useQueryClient();

  const flow: Flow = [
    'title',
    'contentType',
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
        }) => !rawValues.remoteContentEnabled,
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
                  team={props.team}
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
        }) => !!rawValues.remoteContentEnabled,
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
                <AssetButton onChange={onChange} team={props.team} setValue={setValue} rawValues={rawValues} formModalProps={{
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
      remoteContentHeaders: {
        type: type.object,
        visible: ({
          rawValues
        }: any) => !!rawValues.remoteContentEnabled,
        label: translate('Content headers'),
      },
    }
  };

  const updatePage = (selectedPage: string) => {
    Services.getApiDocPage(props.api._id, selectedPage)
      .then((page) => {
        if (isError(page)) {
          toast.error(page.error);
        } else {
          openFormModal({
            title: translate('doc.page.update.modal.title'),
            flow: flow,
            schema: schema(updatedPage => savePage(updatedPage, page)),
            value: page,
            noClose: page.linked,
            onSubmit: updatedPage => {
              if (page.linked) {
                confirm({ message: translate('doc.page.linked.confirm') })
                  .then(ok => {
                    if (ok) {
                      savePage(updatedPage, page)
                    }
                  })
              } else {
                savePage(updatedPage, page)
              }

            },
            actionLabel: translate('Save')
          })
        }
      });
  }

  const updateTitle = (pages: IDocumentationPages, title: string, id: string) => {
    return pages.map(page => {
      if (page.id === id) {
        return { ...page, title }
      } else {
        return { ...page, children: updateTitle(page.children, title, id) }
      }
    })
  }

  const savePage = (page: IDocPage, original: IDocPage) => {
    if (page) {
      return Services.saveDocPage(props.team._id, page)
        .then((resp) => {
          if (isError(resp)) {
            toast.error(resp.error);
          } else if (resp.title === original.title) {
            props.reloadState()
            toast.success(translate("doc.page.save.successfull"))
          } else {
            updatePages(updateTitle(props.documentation.pages, page.title, page._id))
          }
        })
    }
  }

  const updatePages = (pages: IDocumentationPages) => {
    return props.onSave({ ...props.documentation, pages })
      .then(() => {
        toast.success(translate('doc.page.update.successfull'))
        props.reloadState()
      })
  }

  const addNewPage = () => {
    const newPage: IDocPage = {
      _id: nanoid(32),
      _tenant: tenant._id,
      _deleted: false,
      _humanReadableId: 'new-page',
      title: 'New page',
      lastModificationAt: Date.now(),
      content: '# New page\n\nA new page',
      contentType: 'text/markdown',
      remoteContentEnabled: false,
      remoteContentUrl: null,
      remoteContentHeaders: {}
    }

    openFormModal({
      title: translate('doc.page.create.modal.title'),
      flow: flow,
      schema: schema(saveNewPage),
      value: newPage,
      onSubmit: saveNewPage,
      actionLabel: translate('Save')
    })
  }

  const saveNewPage = (page: IDocPage) => {
    Services.createDocPage(props.team._id, page)
      .then(page => props.onSave({
        ...props.documentation,
        pages: [
          ...props.documentation.pages,
          {
            id: page._id,
            title: page.title,
            children: []
          }
        ]
      })
      )
      .then(() => props.reloadState())
  }

  const deletePage = (page: IDocumentationPage) => {
    const apiDocPageToList = (page: IDocumentationPage, list: Array<string>) => {
      if (page.children.length) {
        return [page, ...page.children.flatMap(child => apiDocPageToList(child, list))]
      } else {
        return [page, ...list]
      }
    }
    Promise.all([
      apiDocPageToList(page, []).map((apiDoc => Services.deleteDocPage(props.team._id, apiDoc.id)))
    ]).then(() => {
      toast.success(translate('doc.page.deletion.successfull'))
      queryClient.invalidateQueries({ queryKey: ['details'] })
    })
  }

  return (
    <div className="row">
      <div className="col-12 col-sm-6 col-lg-6">
        <div className="d-flex flex-column">
          <div className="">
            <div className="d-flex justify-content-between align-items-center">
              <div className="btn-group ms-2">
                <button onClick={addNewPage} type="button" className="btn btn-sm btn-outline-success">
                  {translate('documentation.add.page.btn.label')}
                </button>
                {props.importAuthorized &&
                  <button
                    onClick={props.importPage}
                    type="button"
                    className="btn btn-sm btn-outline-primary">
                    <i className="fas fa-download" />
                  </button>
                }
              </div>
            </div>
          </div>
          <div className='d-flex flex-column'>
            <DnDoc
              items={props.documentation?.pages || []}
              deletePage={deletePage}
              updatePages={updatePages}
              confirmRemoveItem={() => (confirm({ message: translate('delete.documentation.page.confirm') }))}
              updateItem={updatePage} />
          </div>
        </div>
      </div>
    </div>
  );
};

type DndProps = {
  items: IDocumentationPages,
  deletePage: (p: IDocumentationPage) => void,
  updatePages: (p: IDocumentationPages) => void,
  confirmRemoveItem: () => Promise<boolean>,
  updateItem: (id: string) => void
}

const DnDoc = ({ items, deletePage, updatePages, confirmRemoveItem, updateItem }: DndProps) => {
  return (
    <Wrapper>
      <SortableTree collapsible indicator removable defaultItems={items}
        handleUpdateItems={updatePages}
        handleUpdateItem={updateItem}
        handleRemoveItem={deletePage}
        confirmRemoveItem={confirmRemoveItem} />
    </Wrapper>
  )
}
