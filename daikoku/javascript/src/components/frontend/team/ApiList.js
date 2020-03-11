import React, { Component, useState } from 'react';
import { PropTypes } from 'prop-types';
import { connect } from 'react-redux';
import Select from 'react-select';
import Pagination from 'react-paginate';
import _ from 'lodash';
import faker from 'faker';

import { ApiCard } from '../api';
import { ActionWithTeamSelector, Can, CanIDoAction, manage, api } from '../../utils';
import { updateTeamPromise, openCreationTeamModal } from '../../../core';
import { Translation, t } from '../../../locales';

import * as Services from '../../../services';

const all = { value: 'All', label: 'All' };
const allCategories = language => ({ value: 'All', label: t('All categories', language) });
const allTags = language => ({ value: 'All', label: t('All tags', language) });

const computeTop = arrayOfArray => {
  return arrayOfArray
    .flat()
    .reduce((acc, value) => {
      const val = acc.find(item => item.value === value);
      let newVal;
      if (val) {
        newVal = { ...val, count: val.count + 1 };
      } else {
        newVal = { value, label: value, count: 1 };
      }
      return [...acc.filter(item => item.value !== value), newVal];
    }, [])
    .sort((a, b) => b.count - a.count);
};

class ApiListComponent extends Component {
  state = {
    searched: '',
    selectedPage: 0,
    offset: 0,
    pageNumber: 10,
    selectedTag: allTags(this.props.currentLanguage),
    selectedCategory: allCategories(this.props.currentLanguage),
    tags: [],
    categories: [],
    prevPropsApis: [],
  };

  componentDidMount() {
    this.computeTops(this.props.apis);
  }

  static getDerivedStateFromProps(props, state) {
    // Re-run the filter whenever the list array or filter text change.
    // Note we need to store prevPropsList and prevFilterText to detect changes.
    if (!_.isEqual(props.apis, state.prevPropsApis)) {
      // const tags = this.computeTop(props.apis.map(api => api.tags));
      // const categories = this.computeTop(props.apis.map(api => api.categories));

      const tags = computeTop(props.apis.map(api => api.tags));
      const categories = computeTop(props.apis.map(api => api.categories));

      return {
        prevPropsApis: props.apis,
        tags,
        categories,
      };
    }
    return null;
  }

  createNewApi = teamId => {
    Promise.all([
      Services.fetchNewApi().then(e => {
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
        e._humanReadableId = apiName
          .replace(/\s/gi, '-')
          .toLowerCase()
          .trim();
        return e;
      }),
      this.props.updateTeam(this.props.myTeams.find(t => t._id === teamId)),
    ]).then(([newApi]) => {
      this.props.history.push(
        `/${this.props.currentTeam._humanReadableId}/settings/apis/${newApi._id}/infos`,
        { newApi: { ...newApi, team: this.props.currentTeam._id } }
      );
    });
  };

  createNewteam = () => {
    Services.fetchNewTeam()
      .then(team => this.props.openCreationTeamModal(
        {
          currentLanguage: this.props.currentLanguage,
          history: this.props.history,
          team
        }
      ))
  }

  redirectToTeam = team => {
    this.props.history.push(`/${team._humanReadableId}/settings`);
  };

  computeTops(apis) {
    const tags = computeTop(apis.map(api => api.tags));
    const categories = computeTop(apis.map(api => api.categories));

    this.setState({ tags, categories });
  }

  tagMatches(api, term) {
    return !!_.find(
      api.tags,
      tag =>
        tag
          .trim()
          .toLowerCase()
          .indexOf(term) > -1
    );
  }
  categoryMatches(api, term) {
    return !!_.find(
      api.categories,
      cat =>
        cat
          .trim()
          .toLowerCase()
          .indexOf(term) > -1
    );
  }
  teamMatch(api, searched) {
    const ownerTeam = this.props.teams.find(t => t._id === api.team);
    return (
      ownerTeam &&
      ownerTeam.name
        .trim()
        .toLowerCase()
        .indexOf(searched) > -1
    );
  }

  filterPreview(count) {
    const { selectedCategory, selectedTag, searched } = this.state;
    if (selectedCategory.value === all.value && selectedTag.value === all.value && !searched) {
      return null;
    }

    return (
      <div className="d-flex justify-content-between">
        <div className="preview">
          <strong>{count}</strong>{' '}
          {`${t('result', this.props.currentLanguage)}${count > 1 ? 's' : ''}`}&nbsp;
          {!!searched && (
            <span>
              {t('matching', this.props.currentLanguage)} <strong>{searched}</strong>&nbsp;
            </span>
          )}
          {selectedCategory.value !== all.value && (
            <span>
              {t('categorised in', this.props.currentLanguage)}{' '}
              <strong>{selectedCategory.value}</strong>&nbsp;
            </span>
          )}
          {selectedTag.value !== all.value && (
            <span>
              {t('tagged', this.props.currentLanguage)} <strong>{selectedTag.value}</strong>
            </span>
          )}
        </div>
        <div
          className="clear cursor-pointer"
          onClick={() =>
            this.setState({
              selectedCategory: allCategories(this.props.currentLanguage),
              selectedTag: allTags(this.props.currentLanguage),
              searched: '',
            })
          }>
          <i className="far fa-times-circle mr-1" />
          <Translation i18nkey="clear filter" language={this.props.currentLanguage}>
            clear filter
          </Translation>
        </div>
      </div>
    );
  }

  handlePageClick = data => {
    debugger
    this.setState({ offset: data.selected * this.state.pageNumber, selectedPage: data.selected }, 
      () => console.debug({ offset: data.selected * this.state.pageNumber, selectedPage: data.selected}));
  };

  render() {
    const user = this.props.connectedUser;
    const apis = this.props.apis;
    const searched = this.state.searched.trim().toLowerCase();

    const categorisedApis = apis.filter(
      api =>
        this.state.selectedCategory.value === all.value ||
        api.categories.includes(this.state.selectedCategory.value)
    );

    const taggedApis = categorisedApis.filter(
      api =>
        this.state.selectedTag.value === all.value ||
        api.tags.includes(this.state.selectedTag.value)
    );

    const filteredApis =
      searched === ''
        ? taggedApis
        : taggedApis.filter(api => {
            if (api.name.toLowerCase().indexOf(searched) > -1) {
              return true;
            } else if (api.smallDescription.toLowerCase().indexOf(searched) > -1) {
              return true;
            } else if (api.description.toLowerCase().indexOf(searched) > -1) {
              return true;
            } else if (this.teamMatch(api, searched)) {
              return true;
            } else return this.tagMatches(api, searched) || this.categoryMatches(api, searched);
          });

    const paginateApis = filteredApis.slice(
      this.state.offset,
      this.state.offset + this.state.pageNumber
    );

    return (
      <section className="container">
        <div className="row mb-2">
          <div className="col-12 col-sm mb-2">
            <input
              type="text"
              className="form-control"
              placeholder={t('Search your API...', this.props.currentLanguage)}
              aria-label="Search your API"
              value={this.state.searched}
              onChange={e =>
                this.setState({ searched: e.target.value, selectedPage: 0, offset: 0 })
              }
            />
          </div>
          <Select
            name="tag-selector"
            className="tag__selector filter__select reactSelect col-6 col-sm mb-2"
            value={this.state.selectedTag}
            clearable={false}
            options={[allTags(this.props.currentLanguage), ...this.state.tags]}
            onChange={e => {
              this.setState({ selectedTag: e, selectedPage: 0, offset: 0 });
            }}
            classNamePrefix="reactSelect"
          />
          <Select
            name="category-selector"
            className="category__selector filter__select reactSelect col-6 col-sm mb-2"
            value={this.state.selectedCategory}
            clearable={false}
            options={[allCategories(this.props.currentLanguage), ...this.state.categories]}
            onChange={e => {
              this.setState({ selectedCategory: e, selectedPage: 0, offset: 0 });
            }}
            classNamePrefix="reactSelect"
          />
          {this.props.team && (
            <Can I={manage} a={api} team={this.props.team}>
              <div className="col-12 col-sm-2">
                <button
                  className="btn btn-access-negative mb-2 float-right"
                  onClick={() => this.createNewApi(this.props.team._id)}>
                  <i className="fas fa-plus-square" /> API
                </button>
              </div>
            </Can>
          )}
          {!this.props.team && !this.props.connectedUser.isGuest && (
            <ActionWithTeamSelector
              title={t(
                'api.creation.title.modal',
                this.props.currentLanguage,
                false,
                'Select the team for which to create new api'
              )}
              description={t(
                'api.creation.description.modal',
                this.props.currentLanguage,
                false,
                'You are going to create an api. For which team do you want to create it ?'
              )}
              teams={this.props.myTeams.filter(t =>
                CanIDoAction(this.props.connectedUser, manage, api, t)
              )}
              action={team => this.createNewApi(team)}
              withAllTeamSelector={false}>
              <div className="col-12 col-sm-2">
                <button className="btn btn-access-negative mb-2 float-right">
                  <i className="fas fa-plus-square" /> API
                </button>
              </div>
            </ActionWithTeamSelector>
          )}
        </div>
        <div className="row">
          <div className="d-flex col flex-column p-3 section">
            {this.filterPreview(filteredApis.length)}
            {paginateApis.map(api => (
              <ApiCard
                key={api._id}
                user={user}
                api={api}
                showTeam={this.props.showTeam}
                teamVisible={this.props.teamVisible}
                team={this.props.teams.find(t => t._id === api.team)}
                myTeams={this.props.myTeams}
                askForApiAccess={teams => this.props.askForApiAccess(api, teams)}
                redirectToTeamPage={team => this.props.redirectToTeamPage(team)}
                redirectToApiPage={() => this.props.redirectToApiPage(api)}
                redirectToEditPage={() => this.props.redirectToEditPage(api)}
                handleTagSelect={tag =>
                  this.setState({ selectedTag: this.state.tags.find(t => t.value === tag) })
                }
                handleCategorySelect={category =>
                  this.setState({
                    selectedCategory: this.state.categories.find(c => c.value === category),
                  })
                }
                currentLanguage={this.props.currentLanguage}
              />
            ))}
            <div className="apis__pagination">
              <Pagination
                previousLabel={t('Previous', this.props.currentLanguage)}
                nextLabel={t('Next', this.props.currentLanguage)}
                breakLabel="..."
                breakClassName={'break'}
                pageCount={Math.ceil(filteredApis.length / this.state.pageNumber)}
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
          <div className="d-flex col-12 col-sm-3 text-muted flex-column p-3">
            {!this.props.team && !this.props.connectedUser.isGuest && (
              <YourTeams
                teams={this.props.myTeams}
                redirectToTeam={this.redirectToTeam}
                currentlanguage={this.props.currentLanguage}
                createNewTeam={this.createNewteam}
              />
            )}
            {!!this.state.tags.length && (
              <Top
                className="p-3 rounded additionalContent mb-2"
                title="Top tags"
                icon="fas fa-tag mr-2"
                list={this.state.tags}
                formatter={tag => tag.value}
                handleClick={tag => this.setState({ selectedTag: tag })}
              />
            )}
            {!!this.state.categories.length && (
              <Top
                className="p-3 rounded additionalContent"
                title="Top categories"
                icon="fas fa-folder mr-2"
                list={this.state.categories}
                formatter={category => category.value}
                handleClick={category => this.setState({ selectedCategory: category })}
              />
            )}
          </div>
        </div>
      </section>
    );
  }
}

const mapStateToProps = state => ({
  ...state.context,
});

const mapDispatchToProps = {
  updateTeam: team => updateTeamPromise(team),
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

const Top = props => {
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
    ? teams.filter(team => team.name.toLowerCase().includes(searchedTeam))
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
            onChange={e => setSearchedTeam(e.target.value)}
        />
        <div className="input-group-append">
            <button
                className="btn btn-access-negative"
                onClick={() => createNewTeam()}>
                <i className="fas fa-plus-square" />
            </button>
        </div>
    </div>
      <div className="d-flex flex-column">
        {_.sortBy(maybeTeams, team => team.name.toLowerCase())
          .slice(0, 5)
          .map(team => {
            return (
              <span
                className="p-1 cursor-pointer underline-on-hover"
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
