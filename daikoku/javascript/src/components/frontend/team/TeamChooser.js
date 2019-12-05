import React, { Component } from 'react';
import { connect } from 'react-redux';
import Pagination from 'react-paginate';

import * as Services from '../../../services';

import { TeamCard } from '.';
import { updateTeamPromise } from '../../../core/context';
import { t, Translation } from '../../../locales';

class TeamChooserComponent extends Component {
  state = {
    teams: [],
    searched: '',
    offset: 0,
    pageNumber: 10,
    selectedPage: 0,
  };

  componentDidMount() {
    Services.allJoinableTeams().then(teams => this.setState({ teams }));
  }

  askToJoin = (e, team) => {
    Services.askToJoinTeam(team._id)
      .then(() => Services.allJoinableTeams())
      .then(teams => this.setState({ teams }));
  };

  redirectToTeamSettings = team => {
    this.props
      .updateTeam(team)
      .then(() => this.props.history.push(`/${team._humanReadableId}/settings`));
  };

  handlePageClick = data => {
    this.setState({ offset: data.selected * this.state.pageNumber, selectedPage: data.selected });
  };

  render() {
    const teams = this.state.teams;
    const searched = this.state.searched.trim().toLowerCase();
    const filteredTeams =
      searched === ''
        ? teams
        : teams.filter(team => {
          if (team.name.toLowerCase().indexOf(searched) > -1) {
            return true;
          } else return team.description.toLowerCase().indexOf(searched) > -1;
        });
    const paginateTeams = filteredTeams.slice(
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
                  <Translation i18nkey="All teams" language={this.props.currentLanguage}>
                    All teams
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
                placeholder={t("Search a team", this.props.currentLanguage)}
                aria-label="Search a team"
                value={this.state.searched}
                onChange={e => this.setState({ searched: e.target.value })}
              />
            </div>
          </div>
          <div className="row">
            <div className="d-flex col flex-column p-3">
              {paginateTeams.map(team => (
                <TeamCard
                  key={team._id}
                  user={this.props.connectedUser}
                  team={team}
                  currentLanguage={this.props.currentLanguage}
                  askToJoin={e => this.askToJoin(e, team)}
                  redirectToTeamPage={() => this.props.history.push(`/${team._humanReadableId}`)}
                  redirectToTeamSettings={() => this.redirectToTeamSettings(team)}
                />
              ))}
              <div className="apis__pagination">
                <Pagination
                  previousLabel={t('Previous', this.props.currentLanguage)}
                  nextLabel={t('Next', this.props.currentLanguage)}
                  breakLabel="..."
                  breakClassName={'break'}
                  pageCount={Math.ceil(filteredTeams.length / this.state.pageNumber)}
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

const mapDispatchToProps = {
  updateTeam: team => updateTeamPromise(team),
};

export const TeamChooser = connect(
  mapStateToProps,
  mapDispatchToProps
)(TeamChooserComponent);
