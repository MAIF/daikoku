import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Spinner } from '../utils';
import _ from 'lodash';

import ReactTable from 'react-table';
import { t } from '../../locales';

const LazyForm = React.lazy(() => import('./Form'));

function urlTo(url) {
  window.history.replaceState({}, '', url);
}

function LoadingComponent(props) {
  return (
    <div
      className="loadingPage"
      style={{
        display:
          props.loading && props.loadingText && props.loadingText.trim().length > 0
            ? 'flex'
            : 'none',
      }}>
      {props.loadingText}
    </div>
  );
}

export class Table extends Component {
  static propTypes = {
    itemName: PropTypes.string.isRequired,
    columns: PropTypes.array.isRequired,
    fetchItems: PropTypes.func.isRequired,
    updateItem: PropTypes.func,
    deleteItem: PropTypes.func,
    createItem: PropTypes.func,
    navigateTo: PropTypes.func,
    stayAfterSave: PropTypes.bool.isRequired,
    showActions: PropTypes.bool.isRequired,
    showLink: PropTypes.bool.isRequired,
    formSchema: PropTypes.object,
    formFlow: PropTypes.array,
    extractKey: PropTypes.func.isRequired,
    defaultValue: PropTypes.func,
    rowNavigation: PropTypes.bool.isRequired,
  };

  static defaultProps = {
    rowNavigation: false,
    stayAfterSave: false,
    pageSize: 15,
    mobileSize: 767,
  };

  state = {
    items: [],
    showAddForm: false,
    showEditForm: false,
    loading: false,
    hasError: false,
  };

  componentDidMount() {
    this.registerSizeChanges();
    this.update().then(() => {
      if (this.props.search) {
        console.log('Todo: default search');
      }
    });
    if (this.props.injectTable) {
      this.props.injectTable(this);
    }
    this.readRoute();
  }

  registerSizeChanges = () => {
    this.sizeListener = _.debounce(() => {
      this.forceUpdate();
    }, 400);
    window.addEventListener('resize', this.sizeListener);
  };

  componentWillUnmount() {
    window.removeEventListener('resize', this.sizeListener);
    this.unmountShortcuts();
  }

  componentDidCatch(err, info) {
    this.setState({ hasError: true });
    console.log('Table has error', err, info);
  }

  readRoute = () => {
    if (this.props.parentProps && this.props.parentProps.params.taction) {
      const action = this.props.parentProps.params.taction;
      if (action === 'add') {
        this.showAddForm();
      } else if (action === 'edit') {
        const item = this.props.parentProps.params.titem;
        this.props.fetchItems().then(data => {
          console.log(this.props.parentProps.params);
          console.log(data);
          const row = data.filter(d => this.props.extractKey(d) === item)[0];
          this.showEditForm(null, row);
        });
      }
    }
  };

  mountShortcuts = () => {
    document.body.addEventListener('keydown', this.saveShortcut);
  };

  unmountShortcuts = () => {
    document.body.removeEventListener('keydown', this.saveShortcut);
  };

  saveShortcut = e => {
    if (e.keyCode === 83 && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (this.state.showEditForm) {
        this.updateItem();
      }
      if (this.state.showAddForm) {
        this.createItem();
      }
    }
  };

  update = () => {
    this.setState({ loading: true });
    return this.props.fetchItems().then(
      rawItems => {
        this.setState({ items: rawItems, loading: false });
      },
      () => this.setState({ loading: false })
    );
  };

  gotoItem = (e, item) => {
    if (e && e.preventDefault) e.preventDefault();
    this.props.navigateTo(item);
  };

  closeAddForm = e => {
    if (e && e.preventDefault) e.preventDefault();
    this.unmountShortcuts();
    this.props.parentProps.setTitle(this.props.defaultTitle);
    this.setState({ currentItem: null, showAddForm: false });
    urlTo(`/bo/dashboard/${this.props.selfUrl}`);
  };

  showAddForm = e => {
    if (e && e.preventDefault) e.preventDefault();
    this.mountShortcuts();
    this.props.parentProps.setTitle(`Create a new ${this.props.itemName}`);
    urlTo(`/bo/dashboard/${this.props.selfUrl}/add`);
    this.setState({ currentItem: this.props.defaultValue(), showAddForm: true });
  };

  closeEditForm = e => {
    if (e && e.preventDefault) e.preventDefault();
    this.unmountShortcuts();
    this.props.parentProps.setTitle(this.props.defaultTitle);
    this.setState({ currentItem: null, showEditForm: false });
    urlTo(`/bo/dashboard/${this.props.selfUrl}`);
  };

  showEditForm = (e, item) => {
    if (e && e.preventDefault) e.preventDefault();
    this.mountShortcuts();
    urlTo(`/bo/dashboard/${this.props.selfUrl}/edit/${this.props.extractKey(item)}`);
    this.props.parentProps.setTitle(`Update a ${this.props.itemName}`);
    this.setState({ currentItem: item, showEditForm: true });
  };

  deleteItem = (e, item) => {
    if (e && e.preventDefault) e.preventDefault();
    window.confirm('Are you sure you want to delete that item ?').then(v => {
      if (v) {
        this.props
          .deleteItem(item)
          .then(() => {
            return this.props.fetchItems();
          })
          .then(items => {
            urlTo(`/bo/dashboard/${this.props.selfUrl}`);
            this.setState({ items, showEditForm: false, showAddForm: false });
          });
      }
    });
  };

  createItem = e => {
    if (e && e.preventDefault) e.preventDefault();
    this.props
      .createItem(this.state.currentItem)
      .then(() => {
        return this.props.fetchItems();
      })
      .then(items => {
        urlTo(`/bo/dashboard/${this.props.selfUrl}`);
        this.setState({ items, showAddForm: false });
      });
  };

  createItemAndStay = e => {
    if (e && e.preventDefault) e.preventDefault();
    this.props.createItem(this.state.currentItem).then(() => {
      urlTo(
        `/bo/dashboard/${this.props.selfUrl}/edit/${this.props.extractKey(this.state.currentItem)}`
      );
      this.setState({ showAddForm: false, showEditForm: true });
    });
  };

  updateItem = e => {
    if (e && e.preventDefault) e.preventDefault();
    this.props
      .updateItem(this.state.currentItem)
      .then(() => {
        return this.props.fetchItems();
      })
      .then(items => {
        this.setState({ items, showEditForm: false });
      });
  };

  updateItemAndStay = e => {
    if (e && e.preventDefault) e.preventDefault();
    this.props.updateItem(this.state.currentItem);
  };

  render() {
    if (this.state.hasError) {
      return <h3>Something went wrong !!!</h3>;
    }
    const windowWidth = window.innerWidth;
    const columns = this.props.columns
      .filter(c => {
        if (windowWidth > this.props.mobileSize) {
          return true;
        } else {
          return !c.noMobile;
        }
      })
      .map(c => {
        return {
          Header: c.title,
          id: c.title,
          headerStyle: c.style,
          width: c.style && c.style.width ? c.style.width : undefined,
          style: { ...c.style },
          sortable: !c.notSortable,
          filterable: !c.notFilterable,
          accessor: d => (c.accessor ? d[c.accessor] : c.content ? c.content(d) : d),
          Filter: d => (
            <input
              type="text"
              className="form-control input-sm"
              value={d.filter ? d.filter.value : ''}
              onChange={e => d.onChange(e.target.value)}
              placeholder={t("Search ...", this.props.currentLanguage)}
            />
          ),
          Cell: r => {
            const value = r.value;
            const original = r.original;
            return c.cell ? (
              c.cell(value, original, this)
            ) : (
              <div
                onClick={e => {
                  if (this.props.rowNavigation) {
                    if (e.metaKey) {
                      if (this.props.itemUrl) {
                        const a = document.createElement('a');
                        a.setAttribute('target', '_blank');
                        a.setAttribute('href', this.props.itemUrl(original));
                        a.click();
                      }
                    } else {
                      this.gotoItem(e, original);
                    }
                  }
                }}>
                {value}
              </div>
            );
          },
        };
      });
    if (this.props.showActions) {
      columns.push({
        Header: 'Actions',
        id: 'actions',
        width: 140,
        style: { textAlign: 'center' },
        filterable: false,
        accessor: item => (
          <td style={{ width: 140, textAlign: 'center' }}>
            <div className="displayGroupBtn">
              <button
                type="button"
                className="btn btn-sm btn-outline-success"
                onClick={e => this.showEditForm(e, item)}>
                <i className="fa fa-pencil" />
              </button>
              {this.props.showLink && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  onClick={e => this.gotoItem(e, item)}>
                  <i className="fas fa-link" />
                </button>
              )}
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={e => this.deleteItem(e, item)}>
                <i className="fas fa-trash" />
              </button>
            </div>
          </td>
        ),
      });
    }
    return (
      <div>
        {!this.state.showEditForm && !this.state.showAddForm && (
          <div>
            <div className="row" style={{ marginBottom: 10 }}>
              <div className="col-md-12">
                <button
                  type="button"
                  className="btn btn-sm btn-access-negative float-right"
                  title={t("Reload the table content", this.props.currentLanguage)}
                  onClick={this.update}>
                  <span className="fas fa-sync-alt" />
                </button>
                {this.props.showActions && (
                  <button
                    type="button"
                    className="btn btn-outline-primary"
                    style={{ marginLeft: 10 }}
                    onClick={this.showAddForm}>
                    <span className="fas fa-plus" /> Add item
                  </button>
                )}
                {this.props.injectTopBar && (
                  <div style={{ fontSize: 14 }}>{this.props.injectTopBar()}</div>
                )}
              </div>
            </div>
            <div className="rrow">
              <ReactTable
                className="fulltable -striped -highlight"
                previousText={t("Previous", this.props.currentLanguage)}
                nextText={t("Next", this.props.currentLanguage)}
                noDataText={t("No rows found", this.props.currentLanguage)}
                pageText={t("Page", this.props.currentLanguage)}
                ofText={t('of', this.props.currentLanguage)}
                loadingText={t('loading', this.props.currentLanguage)}
                data={this.state.items}
                loading={this.state.loading}
                filterable={true}
                filterAll={true}
                defaultSorted={[
                  {
                    id: this.props.defaultSort || this.props.columns[0].title,
                    desc: this.props.defaultSortDesc || false,
                  },
                ]}
                defaultFiltered={
                  this.props.search
                    ? [{ id: this.props.columns[0].title, value: this.props.search }]
                    : []
                }
                defaultPageSize={this.props.pageSize}
                columns={columns}
                LoadingComponent={LoadingComponent}
                defaultFilterMethod={(filter, row) => {
                  const id = filter.pivotId || filter.id;
                  if (row[id] !== undefined) {
                    const value = String(row[id]);
                    return value.toLowerCase().indexOf(filter.value.toLowerCase()) > -1;
                  } else {
                    return true;
                  }
                }}
              />
            </div>
          </div>
        )}
        {this.state.showAddForm && (
          <div className="" role="dialog">
            {this.props.formComponent && (
              <form className="form-horizontal" style={this.props.style}>
                {React.createElement(this.props.formComponent, {
                  onChange: currentItem => this.setState({ currentItem }),
                  value: this.state.currentItem,
                  ...(this.props.formPassProps || {}),
                })}
              </form>
            )}
            {!this.props.formComponent && (
              <React.Suspense fallback={<Spinner />}>
                <LazyForm
                  value={this.state.currentItem}
                  onChange={currentItem => this.setState({ currentItem })}
                  flow={this.props.formFlow}
                  schema={this.props.formSchema}
                />
              </React.Suspense>
            )}
            <hr />
            <div className="form-buttons pull-right">
              <button type="button" className="btn btn-outline-danger" onClick={this.closeAddForm}>
                Cancel
              </button>
              {this.props.stayAfterSave && (
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  onClick={this.createItemAndStay}>
                  <i className="fas fa-hdd" /> Create and stay on this {this.props.itemName}
                </button>
              )}
              <button type="button" className="btn btn-outline-primary" onClick={this.createItem}>
                <i className="fas fa-hdd" /> Create {this.props.itemName}
              </button>
            </div>
          </div>
        )}
        {this.state.showEditForm && (
          <div className="" role="dialog">
            {this.props.formComponent && (
              <form className="form-horizontal" style={this.props.style}>
                {React.createElement(this.props.formComponent, {
                  onChange: currentItem => {
                    this.setState({ currentItem });
                  },
                  value: this.state.currentItem,
                  ...(this.props.formPassProps || {}),
                })}
              </form>
            )}
            {!this.props.formComponent && (
              <React.Suspense fallback={<Spinner />}>
                <LazyForm
                  value={this.state.currentItem}
                  onChange={currentItem => this.setState({ currentItem })}
                  flow={this.props.formFlow}
                  schema={this.props.formSchema}
                />
              </React.Suspense>
            )}
            <hr />
            <div className="form-buttons pull-right">
              <button
                type="button"
                className="btn btn-outline-danger"
                title="Delete current item"
                onClick={e => this.deleteItem(e, this.state.currentItem)}>
                <i className="fas fa-trash" /> Delete
              </button>
              <button type="button" className="btn btn-outline-danger" onClick={this.closeEditForm}>
                <i className="fa fa-remove" /> Cancel
              </button>
              {this.props.stayAfterSave && (
                <button
                  type="button"
                  className="btn btn-outline-success"
                  onClick={this.updateItemAndStay}>
                  <i className="fas fa-hdd" /> Update and stay on this {this.props.itemName}
                </button>
              )}
              <button type="button" className="btn btn-outline-success" onClick={this.updateItem}>
                <i className="fas fa-hdd" /> Update {this.props.itemName}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }
}
