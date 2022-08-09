import React, { useEffect, useState, useImperativeHandle, useContext } from 'react';
import { useParams } from 'react-router-dom';
import { Form, constraints, format, type } from '@maif/react-forms';
import { nanoid } from 'nanoid';
import cloneDeep from 'lodash/cloneDeep';
import { connect } from 'react-redux';

import * as Services from '../../../services';
import { Spinner, BeautifulTitle } from '../../utils';
import { AssetChooserByModal, MimeTypeFilter } from '../../frontend';
import { I18nContext, openApiDocumentationSelectModal } from '../../../core';
import { toastr } from 'react-redux-toastr';
import { useDispatch } from 'react-redux';

//@ts-ignore //FIXME: is monkey patch is compatible with ts ???
Array.prototype.move = function (from: any, to: any) {
  this.splice(to, 0, this.splice(from, 1)[0]);
  return this;
};

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
  { label: '.md	Markown file', value: 'text/markdown' },
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

function AssetButton(props: any) {
  const { translateMethod } = useContext(I18nContext);

  return (
    <div className="mb-3 row">
      <label className="col-xs-12 col-sm-2 col-form-label" />
      <div
        className="col-sm-10"
        style={{ width: '100%', marginLeft: 0, display: 'flex', justifyContent: 'flex-end' }}
      >
        <AssetChooserByModal
          team={props.team}
          teamId={props.team._id}
          label={translateMethod('Set from asset')}
          onSelect={(asset: any) => {
            props.onChange(asset.link);
            props.setValue('contentType', asset.contentType)
          }}
        />
      </div>
    </div>
  );
}

export type TeamApiDocumentationRef = {
  saveCurrentPage: () => void
}
type TeamApiDocumentationProps = {
  team: any,
  value: any,
  versionId?: string,
  creationInProgress?: boolean,
  onChange: (value: any) => void,
  reloadState: () => void,
  save: (value: any) => Promise<any>
}
export const TeamApiDocumentation = React.forwardRef<TeamApiDocumentationRef, TeamApiDocumentationProps>((props, ref) => {
  const { team, value, versionId, creationInProgress } = props;
  const params = useParams();

  const [selected, setSelected] = useState<any>(null);
  const [details, setDetails] = useState(undefined);

  const [deletedPage, setDeletedPage] = useState(false);

  const { translateMethod, Translation } = useContext(I18nContext);

  const dispatch = useDispatch();

  const flow = [
    'title',
    'level',
    'contentType',
    'remoteContentEnabled',
    'remoteContentUrl',
    'remoteContentHeaders',
    'content',
  ];

  const schema = {
    title: {
      type: type.string,
      label: translateMethod('Page title'),
      constraints: [
        constraints.required(translateMethod("constraints.required.name"))
      ]
    },
    level: {
      type: type.number,
      label: translateMethod('Page level'),
      defaultValue: 0,
      props: {
        min: 0, step: 1
      },
    },
    content: {
      type: type.string,
      format: format.markdown,
      visible: ({
        rawValues
      }: any) => !rawValues.remoteContentEnabled,
      label: translateMethod('Page content'),
      props: {
        height: '800px',
        team: team,
        actions: (insert: any) => {
          return <>
            <button
              type="button"
              className="btn-for-descriptionToolbar"
              aria-label={translateMethod('Lorem Ipsum')}
              title={translateMethod('Lorem Ipsum')}
              onClick={() => insert(loremIpsum)}
            >
              <i className={`fas fa-feather-alt`} />
            </button>
            <button
              type="button"
              className="btn-for-descriptionToolbar"
              aria-label={translateMethod('Long Lorem Ipsum')}
              title={translateMethod('Long Lorem Ipsum')}
              onClick={() => insert(longLoremIpsum)}
            >
              <i className={`fas fa-feather`} />
            </button>
            <BeautifulTitle
              placement="bottom"
              title={translateMethod('image url from asset')}
            >
              <AssetChooserByModal
                typeFilter={MimeTypeFilter.image}
                onlyPreview
                tenantMode={false}
                team={team}
                teamId={team._id}
                icon="fas fa-file-image"
                classNames="btn-for-descriptionToolbar"
                onSelect={(asset: any) => insert(asset.link)}
                label={translateMethod("Insert URL")}
              />
            </BeautifulTitle>
          </>;
        }
      }
    },
    remoteContentEnabled: {
      type: type.bool,
      label: translateMethod('Remote content'),
    },
    contentType: {
      type: type.string,
      format: format.select,
      label: translateMethod('Content type'),
      options: mimeTypes,
    },
    remoteContentUrl: {
      type: type.string,
      visible: ({
        rawValues
      }: any) => !!rawValues.remoteContentEnabled,
      label: translateMethod('Content URL'),
      render: ({
        onChange,
        value,
        setValue
      }: any) => {
        return (
          <div className='flex-grow-1 ms-3'>
            <input className='mrf-input mb-3' value={value} onChange={onChange} />
            <div className="col-12 d-flex justify-content-end">
              <AssetButton onChange={onChange} team={team} value={value} setValue={setValue} />
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
      label: translateMethod('Content headers'),
    },
  };

  function updateDetails() {
    Services.getDocDetails(params.apiId, versionId).then(setDetails);
  }

  useImperativeHandle(ref, () => ({
    saveCurrentPage() {
      savePage();
    },
  }));

  useEffect(() => {
    if (!creationInProgress) {
      updateDetails();
      setSelected(null);
    }
  }, [versionId]);

  useEffect(() => {
    if (selected || deletedPage) {
      setDeletedPage(false);
      props.save(value)
        .then(() => updateDetails());
    }
  }, [value]);

  function select(selectedPage: any) {
    if (selected) {
      savePage(selected)
        .then(updateDetails)
        .then(() => {
          Services.getDocPage(value._id, selectedPage._id).then((page) => {
            if (page.error) toastr.error(translateMethod('Error'), page.error);
            else setSelected(page);
          });
        });
    } else {
      Services.getDocPage(value._id, selectedPage._id).then((page) => {
        if (page.error) toastr.error(translateMethod('Error'), page.error);
        else setSelected(page);
      });
    }
  }

  function savePage(page?: any) {
    return Services.saveDocPage(team._id, value._id, page || selected)
      .then(() => {
        updateDetails();
        toastr.success(translateMethod('Succes'), translateMethod("doc.page.save.success"))
      });
  }

  function isSelected(page: any) {
    return selected && page._id === selected._id;
  }

  function onUp() {
    let pages = cloneDeep(value.documentation.pages);
    if (selected) {
      const oldIndex = pages.indexOf(selected._id);
      if (oldIndex >= 0) {
        pages = pages.move(oldIndex, oldIndex - 1);
        const newValue = cloneDeep(value);
        newValue.documentation.pages = pages;
        props.onChange(newValue);
        props.save(newValue).then(() => {
          updateDetails();
        });
      }
    }
  }

  function onDown() {
    let pages = cloneDeep(value.documentation.pages);
    if (selected) {
      const oldIndex = pages.indexOf((selected as any)._id);
      if (oldIndex < pages.length) {
        pages = pages.move(oldIndex, oldIndex + 1);
        const newValue = cloneDeep(value);
        newValue.documentation.pages = pages;
        (props as any).onChange(newValue);
        (props as any).save(newValue).then(() => {
          updateDetails();
        });
      }
    }
  }

  function addNewPage() {
    let index = value.documentation.pages.length;
    if (selected) {
      index = value.documentation.pages.indexOf((selected as any)._id) + 1;
    }

    Services.createDocPage(team._id, value._id, {
      _id: nanoid(32),
      _tenant: value._tenant,
      api: value._id,
      title: 'New page',
      index: index,
      level: 0,
      lastModificationAt: Date.now(),
      content: '# New page\n\nA new page',
    }).then((page) => {
      let pages = cloneDeep(value.documentation.pages);
      pages.splice(index, 0, page._id);
      const newValue = cloneDeep(value);
      newValue.documentation.pages = pages;
      setSelected(page);
      (props as any).onChange(newValue);
    });
  }

  function deletePage() {
    (window
      .confirm(translateMethod('delete.documentation.page.confirm', false, 'Are you sure you want to delete this page ?'))) //@ts-ignore //FIXME: remove ts-ognor after fix typing monkey patch of window.confirm
      .then((ok: boolean) => {
        if (ok) {
          Services.deleteDocPage(team._id, value._id, selected?._id)
            .then(() => {
              let pages = cloneDeep(value.documentation.pages).filter((p: any) => p !== selected._id);
              const newValue = cloneDeep(value);
              newValue.documentation.pages = pages;
              setDeletedPage(true);
              setSelected(null);
              props.onChange(newValue);
            });
        }
      });
  }

  function importPage() {
    dispatch(openApiDocumentationSelectModal({
      api: value,
      teamId: (props as any).teamId,
      onClose: () => {
        props.reloadState();
        updateDetails();
      },
    }));
  }

  if (value === null) return null;

  return (<div className="row">
    <div className="col-12 col-sm-6 col-lg-3 p-1">
      <table className="table table-striped table-hover table-sm table-plan-name section">
        <thead className="thead-light">
          <tr>
            <th scope="col" className="d-flex justify-content-between align-items-center">
              Plan title{' '}
              <div className="btn-group">
                <button onClick={onUp} type="button" className="btn btn-sm btn-outline-success">
                  <i className="fas fa-arrow-up" />
                </button>
                <button onClick={onDown} type="button" className="btn btn-sm btn-outline-success">
                  <i className="fas fa-arrow-down" />
                </button>
                <button onClick={addNewPage} type="button" className="btn btn-sm btn-outline-primary">
                  <i className="fas fa-plus" />
                </button>
                <button onClick={importPage} type="button" className="btn btn-sm btn-outline-primary">
                  <i className="fas fa-download" />
                </button>
              </div>
            </th>
          </tr>
        </thead>
        {details && (<tbody>
          {(details as any).titles.map((page: any, index: any) => {
            return (<tr key={page._id}>
              <td className={isSelected(page) ? 'planSelected' : ''} onClick={() => select(page)}>
                <div className="d-flex justify-content-between">
                  {index + 1} - {page.title}
                  <button type="button" className="btn btn-sm btn-outline-primary float-right">
                    <i className="fas fa-edit" />
                  </button>
                </div>
              </td>
            </tr>);
          })}
        </tbody>)}
      </table>
    </div>
    <div className="col-12 col-sm-6 col-lg-9">
      {!!selected && (<div>
        <div className="d-flex justify-content-end">
          <button onClick={deletePage} type="button" className="btn btn-sm btn-outline-danger mb-2">
            <i className="fas fa-trash me-1" />
            <Translation i18nkey="Delete page">Delete page</Translation>
          </button>
        </div>
        <React.Suspense fallback={<Spinner />}>
          <Form flow={flow} schema={schema} value={selected} onSubmit={savePage} />
        </React.Suspense>
      </div>)}
    </div>
  </div>);
});
