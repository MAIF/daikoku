import React, { useState, useEffect, useContext } from 'react';
import { connect } from 'react-redux';
import Select from 'react-select';
import Pagination from 'react-paginate';
import find from 'lodash/find';
import sortBy from 'lodash/sortBy';
import groupBy from 'lodash/groupBy';
import { Grid, List } from 'react-feather';
import classNames from 'classnames';
import { useNavigate } from 'react-router-dom';

import { ApiCard } from '../api';
import { Can, manage, api } from '../../utils';
import { updateTeamPromise, openCreationTeamModal, I18nContext } from '../../../core';

const all = { value: 'All', label: 'All' };
const GRID = 'GRID';
const LIST = 'LIST';

const computeTop = (arrayOfArray: any) => {
  return arrayOfArray
    .flat()
    .reduce((acc: any, value: any) => {
      const val = acc.find((item: any) => item.value === value);
      let newVal;
      if (val) {
        newVal = { ...val, count: val.count + 1 };
      } else {
        newVal = { value, label: value, count: 1 };
      }
      return [...acc.filter((item: any) => item.value !== value), newVal];
    }, [])
    .sort((a: any, b: any) => b.count - a.count);
};

const ApiListComponent = (props: any) => {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
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

  const redirectToTeam = (team: any) => {
    navigate(`/${team._humanReadableId}/settings`);
  };

  const computeTops = (apis: any) => {
    const tags = computeTop(apis.map((api: any) => api.tags));
    const categories = computeTop(apis.map((api: any) => api.categories));

    setTags(tags);
    setCategories(categories);
  };

  const tagMatches = (api: any, term: any) => {
    return !!find(api.tags, (tag) => tag.trim().toLowerCase().indexOf(term) > -1);
  };
  const categoryMatches = (api: any, term: any) => {
    return !!find(api.categories, (cat) => cat.trim().toLowerCase().indexOf(term) > -1);
  };
  const teamMatch = (api: any, searched: any) => {
    const ownerTeam = props.teams.find((t: any) => t._id === api.team._id);
    return ownerTeam && ownerTeam.name.trim().toLowerCase().indexOf(searched) > -1;
  };
  const clearFilter = () => {
    setSelectedTag(allTags());
    setSelectedCategory(allCategories());
    setSearched('');
  };

  const filterPreview = (count: any) => {
    if (selectedCategory.value === all.value && selectedTag.value === all.value && !searched) {
      return null;
    }

    return (
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <div className="d-flex justify-content-between">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="preview">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <strong>{count}</strong> {`${translateMethod('result')}${count > 1 ? 's' : ''}`}
          &nbsp;
          {!!searched && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <span>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              {translateMethod('matching')} <strong>{searched}</strong>&nbsp;
            </span>
          )}
          {selectedCategory.value !== all.value && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <span>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              {translateMethod('categorised in')} <strong>{selectedCategory.value}</strong>
              &nbsp;
            </span>
          )}
          {selectedTag.value !== all.value && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <span>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              {translateMethod('tagged')} <strong>{selectedTag.value}</strong>
            </span>
          )}
        </div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="clear cursor-pointer" onClick={clearFilter}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <i className="far fa-times-circle me-1" />
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="clear filter">clear filter</Translation>
        </div>
      </div>
    );
  };

  const handlePageClick = (data: any) => {
    setOffset(data.selected * pageNumber);
    setSelectedPage(data.selected);
  };

  const user = props.connectedUser;
  const apis = props.apis;
  const searchedTrim = searched.trim().toLowerCase();

  const categorisedApis = apis.filter(
    (api: any) => selectedCategory.value === all.value || api.categories.includes(selectedCategory.value)
  );

  const taggedApis = categorisedApis.filter(
    (api: any) => selectedTag.value === all.value || api.tags.includes(selectedTag.value)
  );

  const filteredApis = Object.values(groupBy((
    searchedTrim === ''
      ? taggedApis
      : taggedApis.filter((api: any) => {
        if (api.name.toLowerCase().indexOf(searchedTrim) > -1) {
          return true;
        } else if (api.smallDescription.toLowerCase().indexOf(searchedTrim) > -1) {
          return true;
        } else if (teamMatch(api, searchedTrim)) {
          return true;
        } else return tagMatches(api, searchedTrim) || categoryMatches(api, searchedTrim);
      })), '_humanReadableId'))
    .map((value) => {
      if (value.length === 1) return value[0];

      const app = value.find((v) => v.isDefault);

      if (!app) return value.find((v) => v.currentVersion === '1.0.0') || value[0];

      return app;
    })

  const paginateApis = (() => {
    const starredApis: any = [],
      unstarredApis: any = [];
    filteredApis.forEach((a) => {
      if (props.connectedUser.starredApis.includes(a._id)) starredApis.push(a);
      else unstarredApis.push(a);
    });

    return [
      ...starredApis.sort(
        // @ts-expect-error TS(7006): Parameter 'a' implicitly has an 'any' type.
        (a, b) => String(a.stars).localeCompare(String(b.stars)) || a.name.localeCompare(b.name)
      ),
      ...unstarredApis.sort(
        // @ts-expect-error TS(7006): Parameter 'a' implicitly has an 'any' type.
        (a, b) => String(a.stars).localeCompare(String(b.stars)) || a.name.localeCompare(b.name)
      ),
    ];
  })().slice(offset, offset + pageNumber);

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <section className="container">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="row mb-2">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="col-12 col-sm mb-2">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Select
          name="tag-selector"
          className="tag__selector filter__select reactSelect col-6 col-sm mb-2"
          value={selectedTag}
          // @ts-expect-error TS(2322): Type '{ name: string; className: string; value: { ... Remove this comment to see the full error message
          clearable={false}
          options={[allTags(), ...tags]}
          onChange={(e) => {
            // @ts-expect-error TS(2345): Argument of type 'SingleValue<{ value: string; lab... Remove this comment to see the full error message
            setSelectedTag(e);
            setOffset(0);
            setSelectedPage(0);
          }}
          classNamePrefix="reactSelect"
        />
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Select
          name="category-selector"
          className="category__selector filter__select reactSelect col-6 col-sm mb-2"
          value={selectedCategory}
          // @ts-expect-error TS(2322): Type '{ name: string; className: string; value: { ... Remove this comment to see the full error message
          clearable={false}
          options={[allCategories(), ...categories]}
          onChange={(e) => {
            // @ts-expect-error TS(2345): Argument of type 'SingleValue<{ value: string; lab... Remove this comment to see the full error message
            setSelectedCategory(e);
            setOffset(0);
            setSelectedPage(0);
          }}
          classNamePrefix="reactSelect"
        />
        {props.team && (!props.tenant.creationSecurity || props.team.apisCreationPermission) && (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <Can I={manage} a={api} team={props.team}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="col-12 col-sm-2">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <button
                className="btn btn-access-negative mb-2 float-right"
                // @ts-expect-error TS(2304): Cannot find name 'createNewApi'.
                onClick={() => createNewApi(props.team._id)}
              >
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <i className="fas fa-plus-square" /> API
              </button>
            </div>
          </Can>
        )}
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="row mb-2 view-selectors">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="col-12 col-sm-9 d-flex justify-content-end">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <button
            className={classNames('btn btn-sm btn-access-negative me-2', { active: view === LIST })}
            onClick={() => setView(LIST)}
          >
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <List />
          </button>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <button
            className={classNames('btn btn-sm btn-access-negative', { active: view === GRID })}
            onClick={() => setView(GRID)}
          >
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Grid />
          </button>
        </div>
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="row">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div
          className={classNames('section d-flex flex-column', {
            'col-12 col-sm-9': !props.groupView,
            'col-12': props.groupView,
          })}
        >
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div
            className={classNames('d-flex justify-content-between p-3', {
              'flex-column': view === LIST,
              'flex-wrap': view === GRID,
              row: view === GRID,
            })}
          >
            {filterPreview(filteredApis.length)}
            {paginateApis.map((api) => {
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              return (<ApiCard key={api._id} user={user} api={api} showTeam={props.showTeam} teamVisible={props.teamVisible} team={props.teams.find((t: any) => t._id === api.team._id)} myTeams={props.myTeams} askForApiAccess={(teams: any) => props.askForApiAccess(api, teams)} redirectToTeamPage={(team: any) => props.redirectToTeamPage(team)} redirectToApiPage={() => props.redirectToApiPage(api)} redirectToEditPage={() => props.redirectToEditPage(api)} handleTagSelect={(tag: any) => setSelectedTag(tags.find((t) => (t as any).value === tag))} toggleStar={() => props.toggleStar(api)} handleCategorySelect={(category: any) => setSelectedCategory(categories.find((c) => (c as any).value === category))} view={view} connectedUser={props.connectedUser} groupView={props.groupView}/>);
            })}
          </div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="apis__pagination">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
        {!props.groupView && (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <div className="d-flex col-12 col-sm-3 text-muted flex-column px-3 mt-2 mt-sm-0">
            {!props.team && !props.connectedUser.isGuest && (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <YourTeams teams={props.myTeams} redirectToTeam={redirectToTeam} />
            )}
            {!!tags.length && (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <Top
                className="p-3 rounded additionalContent mb-2"
                title="Top tags"
                icon="fas fa-tag me-2"
                list={tags}
                formatter={(tag: any) => tag.value}
                handleClick={setSelectedTag}
              />
            )}
            {!!categories.length && (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <Top
                className="p-3 rounded additionalContent"
                title="Top categories"
                icon="fas fa-folder me-2"
                list={categories}
                formatter={(category: any) => category.value}
                handleClick={setSelectedCategory}
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
};

const mapStateToProps = (state: any) => ({
  ...state.context
});

const mapDispatchToProps = {
  updateTeam: (team: any) => updateTeamPromise(team),
  openCreationTeamModal: (modalProps: any) => openCreationTeamModal(modalProps),
};

export const ApiList = connect(mapStateToProps, mapDispatchToProps)(ApiListComponent);

const Top = (props: any) => {
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className={`top__container ${props.className ? props.className : ''}`}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <h5>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <i className={props.icon} />
          {props.title}
        </h5>
      </div>
      {props.list.slice(0, 10).map((item: any, idx: any) => {
        return (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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

const YourTeams = ({
  teams,
  redirectToTeam,
  ...props
}: any) => {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  const [searchedTeam, setSearchedTeam] = useState();
  const maybeTeams = searchedTeam
    ? teams.filter((team: any) => team.name.toLowerCase().includes(searchedTeam))
    : teams;
  const language = props.currentlanguage;
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className={'top__container p-3 rounded additionalContent mb-2'}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <h5>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <i className="fas fa-users me-2" />
          {translateMethod('your teams', language)}
        </h5>
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <input
        placeholder={translateMethod('find team', language)}
        className="form-control"
        // @ts-expect-error TS(2345): Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
        onChange={(e) => setSearchedTeam(e.target.value)}
      />
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="d-flex flex-column">
        {sortBy(maybeTeams, (team) => team.name.toLowerCase())
          .slice(0, 5)
          .map((team) => {
            return (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
