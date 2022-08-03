import React, { useContext, useEffect, useState } from 'react';
import { connect } from 'react-redux';
import Pagination from 'react-paginate';
import { useNavigate } from 'react-router-dom';
import * as Services from '../../../services';

import { TeamCard } from '.';
import { updateTeamPromise } from '../../../core';
// @ts-expect-error TS(6142): Module '../../../locales/i18n-context' was resolve... Remove this comment to see the full error message
import { I18nContext } from '../../../locales/i18n-context';

function TeamChooserComponent(props: any) {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, Translation } = useContext(I18nContext);
  const navigate = useNavigate();

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

  const askToJoin = (e: any, team: any) => {
    Services.askToJoinTeam(team._id)
      .then(() => Services.allJoinableTeams())
      .then((teams) => setState({ ...state, teams }));
  };

  const redirectToTeamSettings = (team: any) => {
    props.updateTeam(team).then(() => navigate(`/${team._humanReadableId}/settings`));
  };

  const handlePageClick = (data: any) => {
    setState({ ...state, offset: data.selected * state.pageNumber, selectedPage: data.selected });
  };

  const teams = state.teams;
  const searched = state.searched.trim().toLowerCase();
  const filteredTeams =
    searched === ''
      ? teams
      : teams.filter((team) => {
          if ((team as any).name.toLowerCase().indexOf(searched) > -1) {
            return true;
          } else return (team as any).description.toLowerCase().indexOf(searched) > -1;
        });
  const paginateTeams = filteredTeams.slice(state.offset, state.offset + state.pageNumber);

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return (<main role="main">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <section className="organisation__header col-12 mb-4 p-3">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="container">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="row text-center">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="col-sm-4">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <img className="organisation__avatar" src={props.tenant ? props.tenant.logo : '/assets/images/daikoku.svg'} alt="avatar"/>
            </div>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="col-sm-8 d-flex flex-column justify-content-center">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <h1 className="jumbotron-heading">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Translation i18nkey="All teams">All teams</Translation>
              </h1>
            </div>
          </div>
        </div>
      </section>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <section className="container">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="row mb-2">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="col-12 col-sm mb-2">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <input type="text" className="form-control" placeholder={translateMethod('Search a team')} aria-label="Search a team" value={state.searched} onChange={(e) => setState({ ...state, searched: e.target.value })}/>
          </div>
        </div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="row">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="d-flex col flex-column p-3">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            {paginateTeams.map((team) => (<TeamCard key={(team as any)._id} user={props.connectedUser} team={team} askToJoin={(e) => askToJoin(e, team)} redirectToTeamPage={() => navigate(`/${(team as any)._humanReadableId}`)} redirectToTeamSettings={() => redirectToTeamSettings(team)}/>))}
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="apis__pagination">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Pagination previousLabel={translateMethod('Previous')} nextLabel={translateMethod('Next')} breakLabel="..." breakClassName={'break'} pageCount={Math.ceil(filteredTeams.length / state.pageNumber)} marginPagesDisplayed={1} pageRangeDisplayed={5} onPageChange={handlePageClick} containerClassName={'pagination'} pageClassName={'page-selector'} forcePage={state.selectedPage} activeClassName={'active'}/>
            </div>
          </div>
        </div>
      </section>
    </main>);
}

const mapStateToProps = (state: any) => ({
  ...state.context
});

const mapDispatchToProps = {
  updateTeam: (team: any) => updateTeamPromise(team),
};

export const TeamChooser = connect(mapStateToProps, mapDispatchToProps)(TeamChooserComponent);
