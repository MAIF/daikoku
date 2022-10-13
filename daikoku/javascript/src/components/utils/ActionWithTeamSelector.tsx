import React from 'react';
import { useDispatch } from 'react-redux';

import { openTeamSelectorModal } from '../../core/modal';
import { ITeamSimple } from '../../types';

type TActionWithTeamSelectorComponentProps = {
  title: string;
  description?: string;
  teams: ITeamSimple[];
  pendingTeams?: string[];
  authorizedTeams?: string[];
  action: (...args: any[]) => any;
  withAllTeamSelector?: boolean;
  closeOnSelect?: boolean;
  allowMultipleDemand?: boolean;
  children: JSX.Element
  actionLabel: string
};

export const ActionWithTeamSelector = (props: TActionWithTeamSelectorComponentProps) => {
  const dispatch = useDispatch();

  const openModal = () => {
    if (props.teams.length === 1) {
      props.action([props.teams[0]._id]);
    } else {
      dispatch(openTeamSelectorModal({
        allTeamSelector: props.withAllTeamSelector,
        title: props.title,
        description: props.description,
        teams: props.teams,
        pendingTeams: props.pendingTeams,
        acceptedTeams: props.authorizedTeams,
        action: (teams) => props.action(teams),
        actionLabel: props.actionLabel,
        allowMultipleDemand: props.allowMultipleDemand,
      }));
    }
  };

  if (
    !props.allowMultipleDemand && props.teams.length === 1 &&
    ((props.pendingTeams && props.pendingTeams.includes(props.teams[0]._id)) ||
    (props.authorizedTeams && props.authorizedTeams.includes(props.teams[0]._id)))
  ) {
    return null;
  }

  return <>{React.cloneElement(props.children, { onClick: () => openModal() })}</>;
}