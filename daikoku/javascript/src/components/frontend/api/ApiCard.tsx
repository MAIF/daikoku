import classNames from 'classnames';
import { useContext } from 'react';

import { I18nContext } from '../../../contexts';
import { IApiWithAuthorization, ITeamSimple, IUserSimple } from '../../../types';
import { ActionWithTeamSelector } from '../../utils';
import StarsButton from './StarsButton';

export const ApiCard = (props: {
  user: IUserSimple
  apiWithAutho: Array<IApiWithAuthorization>
  teamVisible: boolean
  team?: ITeamSimple
  myTeams: Array<ITeamSimple>
  askForApiAccess: (teams: Array<string>) => Promise<any>
  redirectToApiPage: () => void
  handleTagSelect: (tag: string) => void
  handleTeamSelect: (team: ITeamSimple) => void
  toggleStar: () => void
  handleCategorySelect: (category: string) => void
  connectedUser: IUserSimple
  groupView?: boolean
  apiId?: string
}) => {
  const apiWithAutho = props.apiWithAutho.find((apiWithAuthorization) => props.groupView ? apiWithAuthorization.api._id === props.apiId : apiWithAuthorization.api.isDefault) || props.apiWithAutho.sort((a, b) => a.api.lastUpdate.localeCompare(b.api.lastUpdate))[0]
  const api = apiWithAutho.api
  const authorizations = apiWithAutho.authorizations
  const allTeamsAreAuthorized =
    api.visibility === 'Public' || authorizations.every((a: any) => a.authorized);

  const isPending =
    authorizations && authorizations.every((a: any) => a.pending && !a.authorized);
  const team = props.team;

  const { translate, Translation } = useContext(I18nContext);

  const accessButton = () => {
    if (
      !allTeamsAreAuthorized &&
      !props.groupView &&
      !['Private', 'AdminOnly'].includes(api.visibility)
    ) {
      return (
        <ActionWithTeamSelector
          title={translate("api.access.modal.title")}
          description={translate({ key: 'api.access.request', replacements: [api.name] })}
          pendingTeams={authorizations.filter((auth: any) => auth.pending).map((auth: any) => auth.team)}
          acceptedTeams={authorizations
            .filter((auth) => auth.authorized)
            .map((auth) => auth.team)}
          teams={props.myTeams?.filter((t: any) => t.type !== 'Admin')}
          action={(teams) => props.askForApiAccess(teams)}
          actionLabel={translate("Ask access to API")}
          allTeamSelector={true}
        >
          {isPending ? (
            <button className="btn btn-sm btn-outline-primary disabled me-1">
              <Translation i18nkey="Pending request">Pending request</Translation>
            </button>
          ) : (
            <button className="btn btn-sm btn-outline-primary me-1">
              <Translation i18nkey="Access">Access</Translation>
            </button>
          )}
        </ActionWithTeamSelector>
      );
    }
    return null;
  };

  const starred = props.user.starredApis.includes(api._id)
  return (
    <div className={classNames("row border-bottom py-4 api-card", { starred, deprecated: api.state === 'deprecated' })} role='listitem' aria-labelledby={api._humanReadableId}>
      <div className="col-12 d-flex justify-content-between api-card__header">
        <div className="d-flex align-items-center" onClick={props.redirectToApiPage}>
          <h3 className='cursor-pointer underline level2-link' id={api._humanReadableId}>{`${api.name}${props.groupView && props.apiWithAutho.length > 1 ? ` - ${api.currentVersion}` : ''}`}</h3>
          {api.state === 'deprecated' && <span className='ms-3 badge text-bg-danger'>deprecated</span>}
        </div>
        <div className="ms-2">
          <div className="btn_group d-flex align-items-start">
            {accessButton()}
            {!props.groupView && (
              <StarsButton
                starred={starred}
                toggleStar={props.toggleStar}
              />
            )}
          </div>
        </div>
      </div>
      <div className="col-12 lead">
        <Translation i18nkey={`${api._humanReadableId}.description`}>
          {api.smallDescription}
        </Translation>
      </div>
      <div className="col-12 d-flex mt-3">
        {!!api.tags.length && (
          <div className="d-flex align-items-center">
            <i className="fas fa-tag me-2" />
            {api.tags.map((tag: any) => <span
              className="badge badge-custom me-1 cursor-pointer"
              key={tag}
              onClick={() => props.handleTagSelect(tag)}
            >
              {tag}
            </span>)}
          </div>
        )}
      </div>
      <div className="col-12 d-flex mt-1">
        {!!api.categories.length && (
          <div className="d-flex">
            <i className="fas fa-folder me-2" />
            {api.categories.map((category: any) => <small
              className="badge badge-custom me-1 cursor-pointer"
              key={category}
              onClick={() => props.handleCategorySelect(category)}
            >
              {category}
            </small>)}
          </div>
        )}
      </div>
      <div className="col-12 d-flex mt-2">
        {props.teamVisible && team && (
          <small
            className="cursor-pointer underline level2-link d-flex align-items-baseline"
            onClick={() => props.handleTeamSelect(team)}
          >
            <img alt="avatar" src={team.avatar} style={{ marginRight: 5, width: 20 }} />
            {team.name}
          </small>
        )}
      </div>
    </div>
  );
};
