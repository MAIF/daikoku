import React, { useContext, useEffect, useState } from 'react';
import { connect } from 'react-redux';
import Pagination from 'react-paginate';

import * as Services from '../../../services';

import { TeamCard } from '.';
import { updateTeamPromise } from '../../../core';
import { I18nContext } from '../../../core/i18n-context';
import { Translation } from '../../../locales';

function TeamChooserComponent(props) {
  const { translateMethod } = useContext(I18nContext);

  const [state, setState] = useState({
    teams: [],
    searched: '',
    offset: 0,
    pageNumber: 10,
    selectedPage: 0,
  });

  useEffect(() => {
    Services.allJoinableTeams().then((teams) => setState({ ...state, teams }));
  }, []);

  const askToJoin = (e, team) => {
    Services.askToJoinTeam(team._id)
      .then(() => Services.allJoinableTeams())
      .then((teams) => setState({ ...state, teams }));
  };

  const redirectToTeamSettings = (team) => {
    props
      .updateTeam(team)
      .then(() => props.history.push(`/${team._humanReadableId}/settings`));
  };

  const handlePageClick = (data) => {
    setState({ ...state, offset: data.selected * state.pageNumber, selectedPage: data.selected });
  };

  const teams = state.teams;
  const searched = state.searched.trim().toLowerCase();
  const filteredTeams =
    searched === ''
      ? teams
      : teams.filter((team) => {
        if (team.name.toLowerCase().indexOf(searched) > -1) {
          return true;
        } else return team.description.toLowerCase().indexOf(searched) > -1;
      });
  const paginateTeams = filteredTeams.slice(
    state.offset,
    state.offset + state.pageNumber
  );

  return (
    <main role="main" className="row">
      <section className="organisation__header col-12 mb-4 p-3">
        <div className="container">
          <div className="row text-center">
            <div className="col-sm-4">
              <img
                className="organisation__avatar"
                src={props.tenant ? props.tenant.logo : '/assets/images/daikoku.svg'}
                alt="avatar"
              />
            </div>
            <div className="col-sm-8 d-flex flex-column justify-content-center">
              <h1 className="jumbotron-heading">
                <Translation i18nkey="All teams">
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
              placeholder={translateMethod('Search a team')}
              aria-label="Search a team"
              value={state.searched}
              onChange={(e) => setState({ ...state, searched: e.target.value })}
            />
          </div>
        </div>
        <div className="row">
          <div className="d-flex col flex-column p-3">
            {paginateTeams.map((team) => (
              <TeamCard
                key={team._id}
                user={props.connectedUser}
                team={team}
  
              
                askToJoin={(e) => askToJoin(e, team)}
                redirectToTeamPage={() => props.history.push(`/${team._humanReadableId}`)}
                redirectToTeamSettings={() => redirectToTeamSettings(team)}
              />
            ))}
            <div className="apis__pagination">
              <Pagination
                previousLabel={translateMethod('Previous')}
                nextLabel={translateMethod('Next')}
                breakLabel="..."
                breakClassName={'break'}
                pageCount={Math.ceil(filteredTeams.length / state.pageNumber)}
                marginPagesDisplayed={1}
                pageRangeDisplayed={5}
                onPageChange={handlePageClick}
                containerClassName={'pagination'}
                pageClassName={'page-selector'}
                forcePage={state.selectedPage}
                activeClassName={'active'}
              />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  updateTeam: (team) => updateTeamPromise(team),
};

export const TeamChooser = connect(mapStateToProps, mapDispatchToProps)(TeamChooserComponent);
