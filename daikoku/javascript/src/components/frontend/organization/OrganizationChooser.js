import React, { Component } from 'react';
import { connect } from 'react-redux';
import Pagination from 'react-paginate';

import * as Services from '../../../services';
import { OrgaCard } from '.';
import { t, Translation } from '../../../locales';

class OrganizationChooserComponent extends Component {
  state = {
    organizations: [],
    searched: '',
    offset: 0,
    pageNumber: 3,
    selectedPage: 0,
  };

  componentDidMount() {
    Services.simpleTenantList().then(organizations => this.setState({ organizations }));
  }

  handlePageClick = data => {
    this.setState({ offset: data.selected * this.state.pageNumber, selectedPage: data.selected });
  };

  render() {
    const organizations = this.state.organizations;
    const searched = this.state.searched.trim().toLowerCase();
    const filteredOrganizations =
      searched === ''
        ? organizations
        : organizations.filter(orga => {
            if (orga.name.toLowerCase().indexOf(searched) > -1) {
              return true;
            } else return orga.desc.toLowerCase().indexOf(searched) > -1;
          });
    const paginateOrganizations = filteredOrganizations.slice(
      this.state.offset,
      this.state.offset + this.state.pageNumber
    );
    return (
      <main role="main">
        <section className="organisation__header  mb-4 p-3">
          <div className="container">
            <div className="row text-center">
              <div className="col-sm-4">
                <img
                  className="organisation__avatar"
                  src={this.props.tenant ? this.props.tenant.logo : '/assets/images/daikoku.svg'}
                  alt="avatar"
                />
              </div>
              <div className="col-sm-8 d-flex flex-column justify-content-center">
                <h1 className="jumbotron-heading">
                  <Translation i18nkey="All organizations" language={this.props.currentLanguage}>
                    All organizations
                  </Translation>
                </h1>
              </div>
            </div>
          </div>
        </section>
        <section className="container">
          <div className="row mb-2">
            <div className="col-12 col-sm mb-2">
              <input
                type="text"
                className="form-control"
                placeholder={t('Search an organization', this.props.currentLanguage)}
                aria-label="Search an organization"
                value={this.state.searched}
                onChange={e => this.setState({ searched: e.target.value })}
              />
            </div>
          </div>
          <div className="row">
            <div className="d-flex col flex-column p-3">
              {paginateOrganizations.map(orga => (
                <OrgaCard
                  key={orga._id}
                  user={this.props.connectedUser}
                  orga={orga}
                  currentLanguage={this.props.currentLanguage}
                />
              ))}
              <div className="apis__pagination">
                <Pagination
                  previousLabel={t('Previous', this.props.currentLanguage)}
                  nextLabel={t('Next', this.props.currentLanguage)}
                  breakLabel="..."
                  breakClassName={'break'}
                  pageCount={Math.ceil(filteredOrganizations.length / this.state.pageNumber)}
                  marginPagesDisplayed={1}
                  pageRangeDisplayed={5}
                  onPageChange={this.handlePageClick}
                  containerClassName={'pagination'}
                  pageClassName={'page-selector'}
                  forcePage={this.state.selectedPage}
                  activeClassName={'active'}
                />
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }
}

const mapStateToProps = state => ({
  ...state.context,
});

export const OrganizationChooser = connect(mapStateToProps)(OrganizationChooserComponent);
