import React, { useState, useEffect, useContext } from 'react';
import { PropTypes } from 'prop-types';
import { connect } from 'react-redux';
import Select from 'react-select';
import Pagination from 'react-paginate';
import _, { filter } from 'lodash';
import faker from 'faker';
import { Grid, List } from 'react-feather';
import classNames from 'classnames';
import { useNavigate } from 'react-router-dom';

import { ApiCard } from '../api';
import { ActionWithTeamSelector, Can, CanIDoAction, manage, api } from '../../utils';
import { updateTeamPromise, openCreationTeamModal, I18nContext } from '../../../core';

import * as Services from '../../../services';

const all = { value: 'All', label: 'All' };
const GRID = 'GRID';
const LIST = 'LIST';

const computeTop = (arrayOfArray) => {
  return arrayOfArray
    .flat()
    .reduce((acc, value) => {
      const val = acc.find((item) => item.value === value);
      let newVal;
      if (val) {
        newVal = { ...val, count: val.count + 1 };
      } else {
        newVal = { value, label: value, count: 1 };
      }
      return [...acc.filter((item) => item.value !== value), newVal];
    }, [])
    .sort((a, b) => b.count - a.count);
};

const ApiListComponent = (props) => {
  const { translateMethod, Translation } = useContext(I18nContext);
  const navigate = useNavigate();

  const allCategories = () => ({ value: 'All', label: translateMethod('All categories') });
  const allTags = () => ({ value: 'All', label: translateMethod('All tags') });

  const [searched, setSearched] = useState('');
  const [selectedPage, setSelectedPage] = useState(0);
  const [offset, setOffset] = useState(0);
  const [selectedTag, setSelectedTag] = useState(allTags());
  const [selectedCategory, setSelectedCategory] = useState(allCategories());
  const [tags, setTags] = useState([]);
  const [categories, setCategories] = useState([]);
  const [view, setView] = useState(LIST);
  const pageNumber = view === GRID ? 12 : 10;

  useEffect(() => {
    computeTops(props.apis);
  }, [props.apis]);

  const createNewApi = (teamId) => {
    if (props.apiCreationPermitted) {
      const team = props.myTeams.find((t) => teamId.includes(t._id));

      Services.fetchNewApi()
        .then((e) => {
          const verb = faker.hacker.verb();
          const apiName =
            verb.charAt(0).toUpperCase() +
            verb.slice(1) +
            ' ' +
            faker.hacker.adjective() +
            ' ' +
            faker.hacker.noun() +
            ' api';

          e.name = apiName;
          e._humanReadableId = apiName.replace(/\s/gi, '-').toLowerCase().trim();
          return e;
        })
        .then((newApi) => {
          navigate(`/${team._humanReadableId}/settings/apis/${newApi._id}/infos`, {
            state: {
              newApi: { ...newApi, team: team._id },
            },
          });
        });
    }
  };

  const createNewteam = () => {
    Services.fetchNewTeam().then((team) => props.openCreationTeamModal({ team }));
  };

  const redirectToTeam = (team) => {
    navigate(`/${team._humanReadableId}/settings`);
  };

  const computeTops = (apis) => {
    const tags = computeTop(apis.map((api) => api.tags));
    const categories = computeTop(apis.map((api) => api.categories));

    setTags(tags);
    setCategories(categories);
  };

  const tagMatches = (api, term) => {
    return !!_.find(api.tags, (tag) => tag.trim().toLowerCase().indexOf(term) > -1);
  };
  const categoryMatches = (api, term) => {
    return !!_.find(api.categories, (cat) => cat.trim().toLowerCase().indexOf(term) > -1);
  };
  const teamMatch = (api, searched) => {
    const ownerTeam = props.teams.find((t) => t._id === api.team._id);
    return ownerTeam && ownerTeam.name.trim().toLowerCase().indexOf(searched) > -1;
  };
  const clearFilter = () => {
    setSelectedTag(allTags());
    setSelectedCategory(allCategories());
    setSearched('');
  };

  const filterPreview = (count) => {
    if (selectedCategory.value === all.value && selectedTag.value === all.value && !searched) {
      return null;
    }

    return (
      <div className="d-flex justify-content-between">
        <div className="preview">
          <strong>{count}</strong> {`${translateMethod('result')}${count > 1 ? 's' : ''}`}
          &nbsp;
          {!!searched && (
            <span>
              {translateMethod('matching')} <strong>{searched}</strong>&nbsp;
            </span>
          )}
          {selectedCategory.value !== all.value && (
            <span>
              {translateMethod('categorised in')} <strong>{selectedCategory.value}</strong>
              &nbsp;
            </span>
          )}
          {selectedTag.value !== all.value && (
            <span>
              {translateMethod('tagged')} <strong>{selectedTag.value}</strong>
            </span>
          )}
        </div>
        <div className="clear cursor-pointer" onClick={clearFilter}>
          <i className="far fa-times-circle me-1" />
          <Translation i18nkey="clear filter">clear filter</Translation>
        </div>
      </div>
    );
  };

  const handlePageClick = (data) => {
    setOffset(data.selected * pageNumber);
    setSelectedPage(data.selected);
  };

  const user = props.connectedUser;
  const apis = props.apis;
  const searchedTrim = searched.trim().toLowerCase();

  const categorisedApis = apis.filter(
    (api) => selectedCategory.value === all.value || api.categories.includes(selectedCategory.value)
  );

  const taggedApis = categorisedApis.filter(
    (api) => selectedTag.value === all.value || api.tags.includes(selectedTag.value)
  );

  const filteredApis = _.chain(
    searchedTrim === ''
      ? taggedApis
      : taggedApis.filter((api) => {
          if (api.name.toLowerCase().indexOf(searchedTrim) > -1) {
            return true;
          } else if (api.smallDescription.toLowerCase().indexOf(searchedTrim) > -1) {
            return true;
          } else if (teamMatch(api, searchedTrim)) {
            return true;
          } else return tagMatches(api, searchedTrim) || categoryMatches(api, searchedTrim);
        })
  )
    .groupBy('_humanReadableId')
    .map((value) => {
      if (value.length === 1) return value[0];

      const app = value.find((v) => v.isDefault);

      if (!app) return value.find((v) => v.currentVersion === '1.0.0') || value[0];

      return app;
    })
    .value();

  const paginateApis = (() => {
    const starredApis = [],
      unstarredApis = [];
    filteredApis.forEach((a) => {
      if (props.connectedUser.starredApis.includes(a._id)) starredApis.push(a);
      else unstarredApis.push(a);
    });

    return [
      ...starredApis.sort(
        (a, b) => String(a.stars).localeCompare(String(b.stars)) || a.name.localeCompare(b.name)
      ),
      ...unstarredApis.sort(
        (a, b) => String(a.stars).localeCompare(String(b.stars)) || a.name.localeCompare(b.name)
      ),
    ];
  })().slice(offset, offset + pageNumber);

  return (
    <section className="container">
      <div className="row mb-2">
        <div className="col-12 col-sm mb-2">
          <input
            type="text"
            className="form-control"
            placeholder={translateMethod('Search your API...')}
            aria-label="Search your API"
            value={searched}
            onChange={(e) => {
              setSearched(e.target.value);
              setOffset(0);
              setSelectedPage(0);
            }}
          />
        </div>
        <Select
          name="tag-selector"
          className="tag__selector filter__select reactSelect col-6 col-sm mb-2"
          value={selectedTag}
          clearable={false}
          options={[allTags(), ...tags]}
          onChange={(e) => {
            setSelectedTag(e);
            setOffset(0);
            setSelectedPage(0);
          }}
          classNamePrefix="reactSelect"
        />
        <Select
          name="category-selector"
          className="category__selector filter__select reactSelect col-6 col-sm mb-2"
          value={selectedCategory}
          clearable={false}
          options={[allCategories(), ...categories]}
          onChange={(e) => {
            setSelectedCategory(e);
            setOffset(0);
            setSelectedPage(0);
          }}
          classNamePrefix="reactSelect"
        />
        {props.team && (!props.tenant.creationSecurity || props.team.apisCreationPermission) && (
          <Can I={manage} a={api} team={props.team}>
            <div className="col-12 col-sm-2">
              <button
                className="btn btn-access-negative mb-2 float-right"
                onClick={() => createNewApi(props.team._id)}
              >
                <i className="fas fa-plus-square" /> API
              </button>
            </div>
          </Can>
        )}
        {props.apiCreationPermitted && !props.team && !props.connectedUser.isGuest && (
          <ActionWithTeamSelector
            title={translateMethod('api.creation.title.modal')}
            description={translateMethod('api.creation.description.modal')}
            teams={props.myTeams
              .filter((t) => t.type !== 'Admin')
              .filter((t) => !props.tenant.creationSecurity || t.apisCreationPermission)
              .filter((t) =>
                CanIDoAction(props.connectedUser, manage, api, t, props.apiCreationPermitted)
              )}
            action={(team) => createNewApi(team)}
            withAllTeamSelector={false}
          >
            <div className="col-12 col-sm-2">
              <button className="btn btn-access-negative mb-2 float-right">
                <i className="fas fa-plus-square" /> API
              </button>
            </div>
          </ActionWithTeamSelector>
        )}
      </div>
      <div className="row mb-2 view-selectors">
        <div className="col-9 d-flex justify-content-end">
          <button
            className={classNames('btn btn-sm btn-access-negative me-2', { active: view === LIST })}
            onClick={() => setView(LIST)}
          >
            <List />
          </button>
          <button
            className={classNames('btn btn-sm btn-access-negative', { active: view === GRID })}
            onClick={() => setView(GRID)}
          >
            <Grid />
          </button>
        </div>
      </div>
      <div className="row">
        <div className="section col-9 d-flex flex-column">
          <div
            className={classNames('d-flex justify-content-between p-3', {
              'flex-column': view === LIST,
              'flex-wrap': view === GRID,
              row: view === GRID,
            })}
          >
            {filterPreview(filteredApis.length)}
            {paginateApis.map((api) => (
              <ApiCard
                key={api._id}
                user={user}
                api={api}
                showTeam={props.showTeam}
                teamVisible={props.teamVisible}
                team={props.teams.find((t) => t._id === api.team._id)}
                myTeams={props.myTeams}
                askForApiAccess={(teams) => props.askForApiAccess(api, teams)}
                redirectToTeamPage={(team) => props.redirectToTeamPage(team)}
                redirectToApiPage={() => props.redirectToApiPage(api)}
                redirectToEditPage={() => props.redirectToEditPage(api)}
                handleTagSelect={(tag) => setSelectedTag(tags.find((t) => t.value === tag))}
                toggleStar={() => props.toggleStar(api)}
                handleCategorySelect={(category) =>
                  setSelectedCategory(categories.find((c) => c.value === category))
                }
                view={view}
                connectedUser={props.connectedUser}
              />
            ))}
          </div>
          <div className="apis__pagination">
            <Pagination
              previousLabel={translateMethod('Previous')}
              nextLabel={translateMethod('Next')}
              breakLabel="..."
              breakClassName={'break'}
              pageCount={Math.ceil(filteredApis.length / pageNumber)}
              marginPagesDisplayed={1}
              pageRangeDisplayed={5}
              onPageChange={handlePageClick}
              containerClassName={'pagination'}
              pageClassName={'page-selector'}
              forcePage={selectedPage}
              activeClassName={'active'}
            />
          </div>
        </div>
        <div className="d-flex col-3 col-sm-3 text-muted flex-column px-3">
          {!props.team && !props.connectedUser.isGuest && (
            <YourTeams
              teams={props.myTeams}
              redirectToTeam={redirectToTeam}
              createNewTeam={createNewteam}
            />
          )}
          {!!tags.length && (
            <Top
              className="p-3 rounded additionalContent mb-2"
              title="Top tags"
              icon="fas fa-tag me-2"
              list={tags}
              formatter={(tag) => tag.value}
              handleClick={setSelectedTag}
            />
          )}
          {!!categories.length && (
            <Top
              className="p-3 rounded additionalContent"
              title="Top categories"
              icon="fas fa-folder me-2"
              list={categories}
              formatter={(category) => category.value}
              handleClick={setSelectedCategory}
            />
          )}
        </div>
      </div>
    </section>
  );
};

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  updateTeam: (team) => updateTeamPromise(team),
  openCreationTeamModal: (modalProps) => openCreationTeamModal(modalProps),
};

export const ApiList = connect(mapStateToProps, mapDispatchToProps)(ApiListComponent);

ApiListComponent.propTypes = {
  myTeams: PropTypes.array.isRequired,
  apis: PropTypes.array.isRequired,
  teams: PropTypes.array.isRequired,
  teamVisible: PropTypes.bool,
  team: PropTypes.object,
  askForApiAccess: PropTypes.func.isRequired,
  redirectToTeamPage: PropTypes.func.isRequired,
  redirectToApiPage: PropTypes.func.isRequired,
  redirectToEditPage: PropTypes.func.isRequired,
};

const Top = (props) => {
  return (
    <div className={`top__container ${props.className ? props.className : ''}`}>
      <div>
        <h5>
          <i className={props.icon} />
          {props.title}
        </h5>
      </div>
      {props.list.slice(0, 10).map((item, idx) => {
        return (
          <span
            className="badge bg-warning me-1 cursor-pointer"
            key={idx}
            onClick={() => props.handleClick(item)}
          >
            {props.formatter(item)}
          </span>
        );
      })}
    </div>
  );
};

const YourTeams = ({ teams, redirectToTeam, createNewTeam, ...props }) => {
  const { translateMethod } = useContext(I18nContext);

  const [searchedTeam, setSearchedTeam] = useState();
  const maybeTeams = searchedTeam
    ? teams.filter((team) => team.name.toLowerCase().includes(searchedTeam))
    : teams;
  const language = props.currentlanguage;
  return (
    <div className={'top__container p-3 rounded additionalContent mb-2'}>
      <div>
        <h5>
          <i className="fas fa-users me-2" />
          {translateMethod('your teams', language)}
        </h5>
      </div>
      <div className="input-group">
        <input
          placeholder={translateMethod('find team', language)}
          className="form-control"
          onChange={(e) => setSearchedTeam(e.target.value)}
        />
        <div className="input-group-append">
          <button className="btn btn-access-negative" onClick={() => createNewTeam()}>
            <i className="fas fa-plus-square" />
          </button>
        </div>
      </div>
      <div className="d-flex flex-column">
        {_.sortBy(maybeTeams, (team) => team.name.toLowerCase())
          .slice(0, 5)
          .map((team) => {
            return (
              <span
                className="p-1 cursor-pointer underline-on-hover text-break"
                key={team._id}
                onClick={() => redirectToTeam(team)}
              >
                {team.name}
              </span>
            );
          })}
      </div>
    </div>
  );
};
