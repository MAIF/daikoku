import React, { Component } from 'react';
import _ from 'lodash';
import * as Services from '../../../services';
import faker from 'faker';
import { toastr } from 'react-redux-toastr';

import { Spinner } from '../../utils';

import { t, Translation } from '../../../locales';
import { AssetChooserByModal } from '../../frontend';

const LazyForm = React.lazy(() => import('../../inputs/Form'));

Array.prototype.move = function(from, to) {
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
            currentLanguage={this.props.currentLanguage}
            team={team}
            teamId={team._id}
            label={t('Set from asset', this.props.currentLanguage)}
            onSelect={asset => {
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

export class TeamApiDocumentation extends Component {
  state = {
    selected: null,
  };

  flow = [
    '_id',
    'title',
    'level',
    'contentType',
    `>>> ${t('Remote content', this.props.currentLanguage)}`,
    'remoteContentEnabled',
    'remoteContentUrl',
    'assetButton',
    'remoteContentHeaders',
    '<<<',
    'content',
  ];

  schema = {
    _id: { type: 'string', disabled: true, props: { label: t('Id', this.props.currentLanguage) } },
    title: { type: 'string', props: { label: t('Page title', this.props.currentLanguage) } },
    //index: { type: 'number', props: { label: 'Page index' } },
    level: { type: 'number', props: { label: t('Page level', this.props.currentLanguage) } },
    content: {
      type: 'markdown',
      props: {
        currentLanguage: this.props.currentLanguage,
        label: 'Page content',
        height: '800px',
        team: () => {
          return this.props.team;
        },
      },
    },
    remoteContentEnabled: {
      type: 'bool',
      props: { label: t('Remote content', this.props.currentLanguage) },
    },
    contentType: {
      type: 'select',
      props: { label: t('Content type', this.props.currentLanguage), possibleValues: mimeTypes },
    },
    remoteContentUrl: {
      type: 'string',
      props: { label: t('Content URL', this.props.currentLanguage) },
    },
    assetButton: { 
      type: AssetButton, 
      props: { label: '', parentProps: () => this.props } 
    },
    remoteContentHeaders: {
      type: 'object',
      props: { label: t('Content headers', this.props.currentLanguage) },
    },
  };

  updateDetails = () => {
    return Services.getDocDetails(this.props.value._id).then(details => {
      return this.setState({ details });
    });
  };

  componentDidMount() {
    if (!this.props.creationInProgress) {
      this.updateDetails();
    }
    if (this.props.hookSavePage) {
      this.props.hookSavePage(() => {
        if (this.state.selected) {
          this.onSave(this.state.selected);
        }
      });
    }
  }

  componentWillUnmount() {
    if (this.props.hookSavePage) {
      this.props.hookSavePage(null);
    }
  }

  select = selected => {
    if (this.state.selected) {
      this.onSave(this.state.selected)
        .then(() => {
          return this.updateDetails();
        })
        .then(() => {
          Services.getDocPage(this.props.value._id, selected._id).then(page => {
            if (page.error) {
              this.setState({ error: page.error });
            } else {
              this.setState({ selected: page });
            }
          });
        });
    } else {
      Services.getDocPage(this.props.value._id, selected._id).then(page => {
        if (page.error) {
          this.setState({ error: page.error });
        } else {
          this.setState({ selected: page });
        }
      });
    }
  };

  onChange = v => {
    this.onSave(v);
  };

  onSave = page => {
    return Services.saveDocPage(this.props.teamId, this.props.value._id, page).then(() => {
      toastr.success(t('Page saved', this.props.currentLanguage));
      return this.updateDetails();
    });
  };

  isSelected = page => {
    return this.state.selected && page._id === this.state.selected._id;
  };

  onReorder = () => {
    return Services.reorderDoc(this.props.team._humanReadableId, this.props.value._humanReadableId)
      .then(details => {
        return this.setState({ details });
      })
      .catch(e => {
        console.log(e);
      });
  };

  onUp = () => {
    let pages = _.cloneDeep(this.props.value.documentation.pages);
    if (this.state.selected) {
      const oldIndex = pages.indexOf(this.state.selected._id);
      if (oldIndex >= 0) {
        pages = pages.move(oldIndex, oldIndex - 1);
        const value = _.cloneDeep(this.props.value);
        value.documentation.pages = pages;
        this.props.onChange(value);
        this.props.save().then(() => {
          this.updateDetails();
        });
      }
    }
  };

  onDown = () => {
    let pages = _.cloneDeep(this.props.value.documentation.pages);
    if (this.state.selected) {
      const oldIndex = pages.indexOf(this.state.selected._id);
      if (oldIndex < pages.length) {
        pages = pages.move(oldIndex, oldIndex + 1);
        const value = _.cloneDeep(this.props.value);
        value.documentation.pages = pages;
        this.props.onChange(value);
        this.props.save().then(() => {
          this.updateDetails();
        });
      }
    }
  };

  addNewPage = () => {
    const selected = this.state.selected;
    let index = this.props.value.documentation.pages.length;
    if (selected) {
      index = this.props.value.documentation.pages.indexOf(selected._id) + 1;
    }

    Services.createDocPage(this.props.teamId, this.props.value._id, {
      _id: faker.random.alphaNumeric(32),
      _tenant: this.props.value._tenant,
      api: this.props.value._id,
      title: 'New page',
      index: index,
      level: 0,
      lastModificationAt: Date.now(),
      content: '# New page\n\nA new page',
    }).then(page => {
      let pages = _.cloneDeep(this.props.value.documentation.pages);
      //pages.push(page._id);
      pages.splice(index, 0, page._id);
      const value = _.cloneDeep(this.props.value);
      value.documentation.pages = pages;
      this.props.onChange(value);
      this.props.save().then(() => {
        this.setState({ selected: page });
        this.updateDetails();
      });
    });
  };

  deletePage = () => {
    window
      .confirm(
        t(
          'delete.documentation.page.confirm',
          this.props.currentLanguage,
          'Are you sure you want to delete this page ?'
        )
      )
      .then(ok => {
        if (ok) {
          Services.deleteDocPage(
            this.props.teamId,
            this.props.value._id,
            this.state.selected._id
          ).then(() => {
            let pages = _.cloneDeep(this.props.value.documentation.pages).filter(
              p => p !== this.state.selected._id
            );
            const value = _.cloneDeep(this.props.value);
            value.documentation.pages = pages;
            this.props.save().then(() => {
              this.setState({ selected: null }, () => {
                this.props.onChange(value);
                this.updateDetails();
              });
            });
          });
        }
      });
  };

  render() {
    if (this.props.value === null) return null;
    return (
      <div className="row">
        <div className="col-3 p-1">
          <table className="table table-striped table-bordered table-hover table-sm table-plan-name">
            <thead className="thead-light">
              <tr>
                <th
                  scope="col"
                  style={{ display: 'flex', justifyContent: 'space-between' }}
                  className="flex-column flex-md-row">
                  Plan title{' '}
                  <div className="btn-group">
                    <button
                      onClick={this.onUp}
                      type="button"
                      className="btn btn-sm btn-outline-success float-right">
                      <i className="fas fa-arrow-up" />
                    </button>
                    <button
                      onClick={this.onDown}
                      type="button"
                      className="btn btn-sm btn-outline-success float-right">
                      <i className="fas fa-arrow-down" />
                    </button>
                    <button
                      onClick={this.addNewPage}
                      type="button"
                      className="btn btn-sm btn-outline-primary float-right">
                      <i className="fas fa-plus" />
                      <span className="d-none d-sm-block">
                        <Translation i18nkey="Add page" language={this.props.currentLanguage}>
                          add page
                        </Translation>
                      </span>
                    </button>
                  </div>
                </th>
              </tr>
            </thead>
            {this.state.details && (
              <tbody>
                {this.state.details.titles.map((page, index) => {
                  return (
                    <tr key={page._id}>
                      <td
                        className={this.isSelected(page) ? 'planSelected' : ''}
                        onClick={() => this.select(page)}>
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
        <div className="col-9">
          {!!this.state.selected && (
            <div>
              <div className="d-flex justify-content-end">
                <button
                  onClick={this.deletePage}
                  type="button"
                  className="btn btn-sm btn-outline-danger mb-2">
                  <i className="fas fa-trash mr-1" />
                  <Translation i18nkey="Delete page" language={this.props.currentLanguage}>
                    Delete page
                  </Translation>
                </button>
              </div>
              <React.Suspense fallback={<Spinner />}>
                <LazyForm
                  flow={this.flow}
                  schema={this.schema}
                  value={this.state.selected}
                  onChange={selected => this.setState({ selected })}
                />
              </React.Suspense>
            </div>
          )}
        </div>
      </div>
    );
  }
}
