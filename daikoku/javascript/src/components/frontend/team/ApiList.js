import React, { useState, useEffect } from 'react';
import { PropTypes } from 'prop-types';
import { connect } from 'react-redux';
import Select from 'react-select';
import Pagination from 'react-paginate';
import _ from 'lodash';
import faker from 'faker';
import { Grid, List } from 'react-feather';
import classNames from 'classnames';

import { ApiCard } from '../api';
import { ActionWithTeamSelector, Can, CanIDoAction, manage, api } from '../../utils';
import { updateTeamPromise, openCreationTeamModal } from '../../../core';
import { Translation, t } from '../../../locales';

import * as Services from '../../../services';

const all = { value: 'All', label: 'All' };
const allCategories = (language) => ({ value: 'All', label: t('All categories', language) });
const allTags = (language) => ({ value: 'All', label: t('All tags', language) });
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
  const [searched, setSearched] = useState('');
  const [selectedPage, setSelectedPage] = useState(0);
  const [offset, setOffset] = useState(0);
  const [selectedTag, setSelectedTag] = useState(allTags(props.currentLanguage));
  const [selectedCategory, setSelectedCategory] = useState(allCategories(props.currentLanguage));
  const [tags, setTags] = useState([]);
  const [categories, setCategories] = useState([]);
  const [view, setView] = useState(LIST);
  const pageNumber = view === GRID ? 12 : 10;

  useEffect(() => {
    computeTops(props.apis);
  }, [props.apis]);

  const createNewApi = (teamId) => {
    if (props.apiCreationPermitted) {
      const team = props.myTeams.find((t) => t._id === teamId);

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
          props.history.push(
            `/${team._humanReadableId}/settings/apis/${newApi._id}/infos`,
            { newApi: { ...newApi, team: team._id } }
          );
        });
    }
  };

  const createNewteam = () => {
    Services.fetchNewTeam().then((team) =>
      props.openCreationTeamModal({
        currentLanguage: props.currentLanguage,
        history: props.history,
        team,
      })
    );
  };

  const redirectToTeam = (team) => {
    props.history.push(`/${team._humanReadableId}/settings`);
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
    const ownerTeam = props.teams.find((t) => t._id === api.team);
    return ownerTeam && ownerTeam.name.trim().toLowerCase().indexOf(searched) > -1;
  };
  const clearFilter = () => {
    setSelectedTag(allTags(props.currentLanguage));
    setSelectedCategory(allCategories(props.currentLanguage));
    setSearched('');
  };

  const filterPreview = (count) => {
    if (selectedCategory.value === all.value && selectedTag.value === all.value && !searched) {
      return null;
    }

    return (
      <div className="d-flex justify-content-between">
        <div className="preview">
          <strong>{count}</strong>{' '}
          {`${t('result', props.currentLanguage)}${count > 1 ? 's' : ''}`}&nbsp;
          {!!searched && (
            <span>
              {t('matching', props.currentLanguage)} <strong>{searched}</strong>&nbsp;
            </span>
          )}
          {selectedCategory.value !== all.value && (
            <span>
              {t('categorised in', props.currentLanguage)}{' '}
              <strong>{selectedCategory.value}</strong>&nbsp;
            </span>
          )}
          {selectedTag.value !== all.value && (
            <span>
              {t('tagged', props.currentLanguage)} <strong>{selectedTag.value}</strong>
            </span>
          )}
        </div>
        <div
          className="clear cursor-pointer"
          onClick={clearFilter}>
          <i className="far fa-times-circle mr-1" />
          <Translation i18nkey="clear filter" language={props.currentLanguage}>
            clear filter
          </Translation>
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
    (api) =>
      selectedCategory.value === all.value ||
      api.categories.includes(selectedCategory.value)
  );

  const taggedApis = categorisedApis.filter(
    (api) =>
      selectedTag.value === all.value ||
      api.tags.includes(selectedTag.value)
  );

  const filteredApis =
    searchedTrim === ''
      ? taggedApis
      : taggedApis.filter((api) => {
        if (api.name.toLowerCase().indexOf(searchedTrim) > -1) {
          return true;
        } else if (api.smallDescription.toLowerCase().indexOf(searchedTrim) > -1) {
          return true;
        } else if (api.description.toLowerCase().indexOf(searchedTrim) > -1) {
          return true;
        } else if (teamMatch(api, searchedTrim)) {
          return true;
        } else return tagMatches(api, searchedTrim) || categoryMatches(api, searchedTrim);
      });

  const paginateApis = filteredApis.slice(
    offset,
    offset + pageNumber
  );

  return (
    <section className="container">
      <div className="row mb-2">
        <div className="col-12 col-sm mb-2">
          <input
            type="text"
            className="form-control"
            placeholder={t('Search your API...', props.currentLanguage)}
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
          options={[allTags(props.currentLanguage), ...tags]}
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
          options={[allCategories(props.currentLanguage), ...categories]}
          onChange={(e) => {
            setSelectedCategory(e);
            setOffset(0);
            setSelectedPage(0);
          }}
          classNamePrefix="reactSelect"
        />
        {props.team &&
          (!props.tenant.creationSecurity || props.team.apisCreationPermission) && (
            <Can I={manage} a={api} team={props.team}>
              <div className="col-12 col-sm-2">
                <button
                  className="btn btn-access-negative mb-2 float-right"
                  onClick={() => createNewApi(props.team._id)}>
                  <i className="fas fa-plus-square" /> API
                  </button>
              </div>
            </Can>
          )}
        {props.apiCreationPermitted &&
          !props.team &&
          !props.connectedUser.isGuest && (
            <ActionWithTeamSelector
              title={t(
                'api.creation.title.modal',
                props.currentLanguage,
                false,
                'Select the team for which to create new api'
              )}
              description={t(
                'api.creation.description.modal',
                props.currentLanguage,
                false,
                'You are going to create an api. For which team do you want to create it ?'
              )}
              teams={props.myTeams
                .filter((t) => t.type !== 'Admin')
                .filter((t) => !props.tenant.creationSecurity || t.apisCreationPermission)
                .filter((t) =>
                  CanIDoAction(
                    props.connectedUser,
                    manage,
                    api,
                    t,
                    props.apiCreationPermitted
                  )
                )}
              action={(team) => createNewApi(team)}
              withAllTeamSelector={false}>
              <div className="col-12 col-sm-2">
                <button className="btn btn-access-negative mb-2 float-right">
                  <i className="fas fa-plus-square" /> API
                  </button>
              </div>
            </ActionWithTeamSelector>
          )}
      </div>
      <div className="d-flex mb-1 view-selectors">
        <button className={classNames('btn btn-access-negative mr-2', { active: view === LIST })} onClick={() => setView(LIST)}><List /></button>
        <button className={classNames('btn btn-access-negative', { active: view === GRID })} onClick={() => setView(GRID)}><Grid /></button>
      </div>
      <div className="row">
        <div className="section col-9 d-flex flex-column">
          <div className={classNames('d-flex justify-content-between col p-3', {
            'flex-column': view === LIST,
            'flex-wrap': view === GRID,
            'flex-row': view === GRID
          })}>
            <div className="col-12 mb-1">
              {filterPreview(filteredApis.length)}
            </div>
            {paginateApis.map((api) => (
              <ApiCard
                key={api._id}
                user={user}
                api={api}
                showTeam={props.showTeam}
                teamVisible={props.teamVisible}
                team={props.teams.find((t) => t._id === api.team)}
                myTeams={props.myTeams}
                askForApiAccess={(teams) => props.askForApiAccess(api, teams)}
                redirectToTeamPage={(team) => props.redirectToTeamPage(team)}
                redirectToApiPage={() => props.redirectToApiPage(api)}
                redirectToEditPage={() => props.redirectToEditPage(api)}
                handleTagSelect={(tag) => setSelectedTag(tags.find((t) => t.value === tag))}
                handleCategorySelect={(category) => setSelectedCategory(categories.find((c) => c.value === category))}
                currentLanguage={props.currentLanguage}
                view={view}
              />
            ))}
          </div>
          <div className="apis__pagination">
            <Pagination
              previousLabel={t('Previous', props.currentLanguage)}
              nextLabel={t('Next', props.currentLanguage)}
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
        <div className="d-flex col-3 col-sm-3 text-muted flex-column p-3">
          {!props.team && !props.connectedUser.isGuest && (
            <YourTeams
              teams={props.myTeams}
              redirectToTeam={redirectToTeam}
              currentlanguage={props.currentLanguage}
              createNewTeam={createNewteam}
            />
          )}
          {!!tags.length && (
            <Top
              className="p-3 rounded additionalContent mb-2"
              title="Top tags"
              icon="fas fa-tag mr-2"
              list={tags}
              formatter={(tag) => tag.value}
              handleClick={setSelectedTag}
            />
          )}
          {!!categories.length && (
            <Top
              className="p-3 rounded additionalContent"
              title="Top categories"
              icon="fas fa-folder mr-2"
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
  history: PropTypes.object.isRequired,
  myTeams: PropTypes.array.isRequired,
  apis: PropTypes.array.isRequired,
  teams: PropTypes.array.isRequired,
  teamVisible: PropTypes.bool,
  team: PropTypes.object,
  refreshTeams: PropTypes.func.isRequired,

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
            className="badge badge-warning mr-1 cursor-pointer"
            key={idx}
            onClick={() => props.handleClick(item)}>
            {props.formatter(item)}
          </span>
        );
      })}
    </div>
  );
};

const YourTeams = ({ teams, redirectToTeam, createNewTeam, ...props }) => {
  const [searchedTeam, setSearchedTeam] = useState();
  const maybeTeams = searchedTeam
    ? teams.filter((team) => team.name.toLowerCase().includes(searchedTeam))
    : teams;
  const language = props.currentlanguage;
  return (
    <div className={'top__container p-3 rounded additionalContent mb-2'}>
      <div>
        <h5>
          <i className="fas fa-users mr-2" />
          {t('your teams', language)}
        </h5>
      </div>
      <div className="input-group">
        <input
          placeholder={t('find team', language)}
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
                onClick={() => redirectToTeam(team)}>
                {team.name}
              </span>
            );
          })}
      </div>
    </div>
  );
};
