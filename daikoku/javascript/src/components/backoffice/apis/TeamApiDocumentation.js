import React, { Component, useEffect, useState, useImperativeHandle, useContext } from 'react';
import _ from 'lodash';
import * as Services from '../../../services';
import faker from 'faker';

import { Spinner } from '../../utils';

import { AssetChooserByModal } from '../../frontend';
import { connect } from 'react-redux';
import { I18nContext, openApiDocumentationSelectModal } from '../../../core';

const LazyForm = React.lazy(() => import('../../inputs/Form'));

Array.prototype.move = function (from, to) {
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

class AssetButton extends Component {
  render() {
    const team = this.props.parentProps().team;
    return (
      <div className="form-group row">
        <label className="col-xs-12 col-sm-2 col-form-label" />
        <div
          className="col-sm-10"
          style={{ width: '100%', marginLeft: 0, display: 'flex', justifyContent: 'flex-end' }}>
          <AssetChooserByModal
            team={team}
            teamId={team._id}
            label={translateMethod('Set from asset')}
            onSelect={(asset) => {
              this.props.onRawChange({
                ...this.props.rawValue,
                contentType: asset.contentType,
                remoteContentUrl: asset.link,
              });
            }}
          />
        </div>
      </div>
    );
  }
}

const TeamApiDocumentationComponent = React.forwardRef((props, ref) => {
  const { team, value, versionId, creationInProgress, params } = props;

  const [selected, setSelected] = useState(null);
  const [details, setDetails] = useState(undefined);
  const [error, setError] = useState();

  const [deletedPage, setDeletedPage] = useState(false);

  const { translateMethod, Translation } = useContext(I18nContext);

  const flow = [
    '_id',
    'title',
    'level',
    'contentType',
    `>>> ${translateMethod('Remote content')}`,
    'remoteContentEnabled',
    'remoteContentUrl',
    'assetButton',
    'remoteContentHeaders',
    '<<<',
    'content',
  ];

  const schema = {
    _id: { type: 'string', disabled: true, props: { label: translateMethod('Id') } },
    title: { type: 'string', props: { label: translateMethod('Page title') } },
    //index: { type: 'number', props: { label: 'Page index' } },
    level: { type: 'number', props: { label: translateMethod('Page level') } },
    content: {
      type: 'markdown',
      props: {
        label: 'Page content',
        height: '800px',
        team: team,
      },
    },
    remoteContentEnabled: {
      type: 'bool',
      props: { label: translateMethod('Remote content') },
    },
    contentType: {
      type: 'select',
      props: { label: translateMethod('Content type'), possibleValues: mimeTypes },
    },
    remoteContentUrl: {
      type: 'string',
      props: { label: translateMethod('Content URL') },
    },
    assetButton: {
      type: AssetButton,
      props: { label: '', parentProps: () => props },
    },
    remoteContentHeaders: {
      type: 'object',
      props: { label: translateMethod('Content headers') },
    },
  };

  function updateDetails() {
    Services.getDocDetails(params.apiId, versionId).then(setDetails);
  }

  useImperativeHandle(ref, () => ({
    saveCurrentPage() {
      onSave();
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
      props.save().then(() => {
        updateDetails();
      });
    }
  }, [value]);

  function select(selectedPage) {
    if (selected) {
      onSave(selected)
        .then(updateDetails)
        .then(() => {
          Services.getDocPage(value._id, selectedPage._id).then((page) => {
            if (page.error) setError(page.error);
            else setSelected(page);
          });
        });
    } else {
      Services.getDocPage(value._id, selectedPage._id).then((page) => {
        if (page.error) setError(page.error);
        else setSelected(page);
      });
    }
  }

  function onSave(page) {
    const data = page || selected;
    if (data)
      return Services.saveDocPage(team._id, value._id, data).then(() => {
        updateDetails();
      });
  }

  function isSelected(page) {
    return selected && page._id === selected._id;
  }

  function onUp() {
    let pages = _.cloneDeep(value.documentation.pages);
    if (selected) {
      const oldIndex = pages.indexOf(selected._id);
      if (oldIndex >= 0) {
        pages = pages.move(oldIndex, oldIndex - 1);
        const newValue = _.cloneDeep(value);
        newValue.documentation.pages = pages;
        props.onChange(newValue);
        props.save().then(() => {
          updateDetails();
        });
      }
    }
  }

  function onDown() {
    let pages = _.cloneDeep(value.documentation.pages);
    if (selected) {
      const oldIndex = pages.indexOf(selected._id);
      if (oldIndex < pages.length) {
        pages = pages.move(oldIndex, oldIndex + 1);
        const newValue = _.cloneDeep(value);
        newValue.documentation.pages = pages;
        props.onChange(newValue);
        props.save().then(() => {
          updateDetails();
        });
      }
    }
  }

  function addNewPage() {
    let index = value.documentation.pages.length;
    if (selected) {
      index = value.documentation.pages.indexOf(selected._id) + 1;
    }

    Services.createDocPage(team._id, value._id, {
      _id: faker.random.alphaNumeric(32),
      _tenant: value._tenant,
      api: value._id,
      title: 'New page',
      index: index,
      level: 0,
      lastModificationAt: Date.now(),
      content: '# New page\n\nA new page',
    }).then((page) => {
      let pages = _.cloneDeep(value.documentation.pages);
      pages.splice(index, 0, page._id);
      const newValue = _.cloneDeep(value);
      newValue.documentation.pages = pages;

      setSelected(page);
      props.onChange(newValue);
    });
  }

  function deletePage() {
    window
      .confirm(
        translateMethod(
          'delete.documentation.page.confirm',
          false,
          'Are you sure you want to delete this page ?'
        )
      )
      .then((ok) => {
        if (ok) {
          Services.deleteDocPage(team._id, value._id, selected._id).then(() => {
            let pages = _.cloneDeep(value.documentation.pages).filter((p) => p !== selected._id);
            const newValue = _.cloneDeep(value);
            newValue.documentation.pages = pages;
            setDeletedPage(true);
            setSelected(null);
            props.onChange(newValue);
          });
        }
      });
  }

  function importPage() {
    props.openApiDocumentationSelectModal({
      api: value,
      teamId: props.teamId,
      onClose: () => {
        props.reloadState();
        updateDetails();
      },
    });
  }

  if (value === null) return null;

  return (
    <div className="row">
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
                  <button
                    onClick={addNewPage}
                    type="button"
                    className="btn btn-sm btn-outline-primary">
                    <i className="fas fa-plus" />
                  </button>
                  <button
                    onClick={importPage}
                    type="button"
                    className="btn btn-sm btn-outline-primary">
                    <i className="fas fa-download" />
                  </button>
                </div>
              </th>
            </tr>
          </thead>
          {details && (
            <tbody>
              {details.titles.map((page, index) => {
                return (
                  <tr key={page._id}>
                    <td
                      className={isSelected(page) ? 'planSelected' : ''}
                      onClick={() => select(page)}>
                      <span>
                        {index + 1} - {page.title}
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary float-right">
                          <i className="fas fa-edit" />
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          )}
        </table>
      </div>
      <div className="col-12 col-sm-6 col-lg-9">
        {!!selected && (
          <div>
            <div className="d-flex justify-content-end">
              <button
                onClick={deletePage}
                type="button"
                className="btn btn-sm btn-outline-danger mb-2">
                <i className="fas fa-trash mr-1" />
                <Translation i18nkey="Delete page">
                  Delete page
                </Translation>
              </button>
            </div>
            <React.Suspense fallback={<Spinner />}>
              <LazyForm flow={flow} schema={schema} value={selected} onChange={setSelected} />
            </React.Suspense>
          </div>
        )}
      </div>
    </div>
  );
});

const mapStateToProps = (state) => ({
  ...state.context,
  error: state.error,
});

const mapDispatchToProps = {
  openApiDocumentationSelectModal: (team) => openApiDocumentationSelectModal(team),
};

export const TeamApiDocumentation = connect(mapStateToProps, mapDispatchToProps, null, {
  forwardRef: true,
})(TeamApiDocumentationComponent);
