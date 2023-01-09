import classNames from 'classnames';
import find from 'lodash/find';
import groupBy from 'lodash/groupBy';
import sortBy from 'lodash/sortBy';
import { useContext, useEffect, useState } from 'react';
import { Grid, List } from 'react-feather';
import Pagination from 'react-paginate';
import { useNavigate } from 'react-router-dom';
import Select, { SingleValue } from 'react-select';

import { useSelector } from 'react-redux';
import { I18nContext } from '../../../core';
import { IApiWithAuthorization, IApiWithSimpleTeam, ITeamSimple, IUserSimple, TOption, TOptions } from '../../../types';
import { IState } from '../../../types/context';
import { ApiCard } from '../api';

const all = { value: 'All', label: 'All' };
const GRID = 'GRID';
const LIST = 'LIST';

const computeTop = (arrayOfArray: string[][]): TOptions => {
  return arrayOfArray
    .flat()
    .reduce<Array<TOption & {count: number}>>((acc, value) => {
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

type TApiList = {
  apis: Array<IApiWithAuthorization>,
  teams: Array<ITeamSimple>,
  team?: ITeamSimple,
  groupView?: boolean,
  myTeams?: Array<ITeamSimple>,
  showTeam: boolean,
  teamVisible: boolean,
  askForApiAccess: (api: IApiWithAuthorization, teams: Array<string>) => Promise<any>,
  redirectToTeamPage: (team: ITeamSimple) => void,
  redirectToApiPage: (api: IApiWithAuthorization) => void,
  redirectToEditPage: (api: IApiWithAuthorization, teams: Array<ITeamSimple>, myTeams: Array<ITeamSimple>) => void,
  toggleStar: (api: IApiWithAuthorization) => void
}

export const ApiList = (props: TApiList) => {
  const { translate, Translation } = useContext(I18nContext);
  const navigate = useNavigate();

  const allCategories = (): TOption => ({ value: 'All', label: translate('All categories') });
  const allTags = (): TOption => ({ value: 'All', label: translate('All tags') });

  const connectedUser = useSelector<IState, IUserSimple>((state) => state.context.connectedUser);

  const [searched, setSearched] = useState('');
  const [selectedPage, setSelectedPage] = useState(0);
  const [offset, setOffset] = useState(0);
  const [selectedTag, setSelectedTag] = useState<TOption | undefined>(allTags());
  const [selectedCategory, setSelectedCategory] = useState<TOption | undefined>(allCategories());
  const [tags, setTags] = useState<TOptions>([]);
  const [categories, setCategories] = useState<TOptions>([]);
  const [view, setView] = useState<'LIST' | 'GRID'>(LIST);
  const pageNumber = view === GRID ? 12 : 10;

  useEffect(() => {
    computeTops(props.apis);
  }, [props.apis]);

  const redirectToTeam = (team: ITeamSimple) => {
    navigate(`/${team._humanReadableId}/settings`);
  };

  const computeTops = (apis: Array<IApiWithSimpleTeam>) => {
    const tags = computeTop(apis.map((api) => api.tags));
    const categories = computeTop(apis.map((api) => api.categories));

    setTags(tags);
    setCategories(categories);
  };

  const tagMatches = (api: IApiWithSimpleTeam, term: string) => {
    return !!find(api.tags, (tag) => tag.trim().toLowerCase().indexOf(term) > -1);
  };
  const categoryMatches = (api: IApiWithSimpleTeam, term: string) => {
    return !!find(api.categories, (cat) => cat.trim().toLowerCase().indexOf(term) > -1);
  };
  const teamMatch = (api: IApiWithSimpleTeam, searched: string) => {
    const ownerTeam = props.teams?.find((t: any) => t._id === api.team._id);
    return ownerTeam && ownerTeam.name.trim().toLowerCase().indexOf(searched) > -1;
  };
  const clearFilter = () => {
    setSelectedTag(allTags());
    setSelectedCategory(allCategories());
    setSearched('');
  };

  const filterPreview = (count: number) => {
    if (selectedCategory?.value === all.value && selectedTag?.value === all.value && !searched) {
      return null;
    }

    return (
      <div className="d-flex justify-content-between">
        <div className="preview">
          <strong>{count}</strong> {`${translate('result')}${count > 1 ? 's' : ''}`}
          &nbsp;
          {!!searched && (
            <span>
              {translate('matching')} <strong>{searched}</strong>&nbsp;
            </span>
          )}
          {selectedCategory?.value !== all.value && (
            <span>
              {translate('categorised in')} <strong>{selectedCategory?.value}</strong>
              &nbsp;
            </span>
          )}
          {selectedTag?.value !== all.value && (
            <span>
              {translate('tagged')} <strong>{selectedTag?.value}</strong>
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

  const user = connectedUser;
  const apis = props.apis;
  const searchedTrim = searched.trim().toLowerCase();

  const categorisedApis = apis.filter(
    (api) => selectedCategory?.value === all.value || api.categories.some(c => c === selectedCategory?.value)
  );

  const taggedApis = categorisedApis.filter(
    (api) => selectedTag?.value === all.value || api.tags.some(t => t === selectedTag?.value)
  );

  const filteredApis = Object.values(groupBy((
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
      })), '_humanReadableId'))
    .map((value) => {
      if (value.length === 1) return value[0];

      const app = value.find((v) => v.isDefault);

      if (!app) return value.find((v) => v.currentVersion === '1.0.0') || value[0];

      return app;
    })

  const paginateApis = (() => {
    const starredApis: Array<IApiWithAuthorization> = [];
    const unstarredApis: Array<IApiWithAuthorization> = [];
    filteredApis.forEach((a) => {
      if (connectedUser.starredApis.includes(a._id)) {
        starredApis.push(a);
      } else {
        unstarredApis.push(a);
      }
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
            placeholder={translate('Search your API...')}
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
          isClearable={false}
          options={[allTags(), ...tags]}
          onChange={(e: SingleValue<TOption>) => {
            setSelectedTag(e || undefined);
            setOffset(0);
            setSelectedPage(0);
          }}
          classNamePrefix="reactSelect"
        />
        <Select
          name="category-selector"
          className="category__selector filter__select reactSelect col-6 col-sm mb-2"
          value={selectedCategory}
          isClearable={false}
          options={[allCategories(), ...categories]}
          onChange={(e: SingleValue<TOption>) => {
            setSelectedCategory(e || undefined);
            setOffset(0);
            setSelectedPage(0);
          }}
          classNamePrefix="reactSelect"
        />
      </div>
      <div className="row mb-2 view-selectors">
        <div className="col-12 col-sm-9 d-flex justify-content-end">
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
        <div
          className={classNames('section d-flex flex-column', {
            'col-12 col-sm-9': !props.groupView,
            'col-12': props.groupView,
          })}
        >
          <div
            className={classNames('d-flex justify-content-between p-3', {
              'flex-column': view === LIST,
              'flex-wrap': view === GRID,
              row: view === GRID,
            })}
          >
            {filterPreview(filteredApis.length)}
            {paginateApis.map((api) => {
              return (<ApiCard
                key={api._id}
                user={user}
                api={api}
                showTeam={props.showTeam}
                teamVisible={props.teamVisible}
                team={props.teams.find((t) => t._id === api.team._id)}
                myTeams={props.myTeams || []}
                askForApiAccess={(teams) => props.askForApiAccess(api, teams)}
                redirectToTeamPage={(team) => props.redirectToTeamPage(team)}
                redirectToApiPage={() => props.redirectToApiPage(api)}
                redirectToEditPage={() => props.redirectToEditPage(api, props.teams, props.myTeams || [])}
                handleTagSelect={(tag) => setSelectedTag(tags.find((t) => t.value === tag))}
                toggleStar={() => props.toggleStar(api)}
                handleCategorySelect={(category) => setSelectedCategory(categories.find((c) => c.value === category))}
                view={view}
                connectedUser={connectedUser}
                groupView={props.groupView} />);
            })}
          </div>
          <div className="apis__pagination">
            <Pagination
              previousLabel={translate('Previous')}
              nextLabel={translate('Next')}
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
          <div className="d-flex col-12 col-sm-3 text-muted flex-column px-3 mt-2 mt-sm-0">
            {!props.team && !connectedUser.isGuest && (
              <YourTeams teams={props.myTeams || []} redirectToTeam={redirectToTeam} />
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
        )}
      </div>
    </section>
  );
};

type TTopProps = {
  className?: string,
  icon: string,
  title: string,
  list: TOptions,
  formatter: (x: TOption) => string,
  handleClick: (x: TOption) => void
}
const Top = (props: TTopProps) => {
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

const YourTeams = ({
  teams,
  redirectToTeam,
}: {
  teams: Array<ITeamSimple>,
  redirectToTeam: (team: ITeamSimple) => void
}) => {
  const { translate } = useContext(I18nContext);

  const [searchedTeam, setSearchedTeam] = useState<string>();
  const maybeTeams = searchedTeam
    ? teams.filter((team) => team.name.toLowerCase().includes(searchedTeam))
    : teams;
  return (
    <div className={'top__container p-3 rounded additionalContent mb-2'}>
      <div>
        <h5>
          <i className="fas fa-users me-2" />
          {translate('your teams')}
        </h5>
      </div>
      <input
        placeholder={translate('find team')}
        className="form-control"
        onChange={(e) => setSearchedTeam(e.target.value)}
      />
      <div className="d-flex flex-column">
        {sortBy(maybeTeams, (team) => team.name.toLowerCase())
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
