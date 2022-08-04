import React from 'react';
import { openTeamSelectorModal } from '../../core/modal';
import { connect } from 'react-redux';

type TActionWithTeamSelectorComponentProps = {
    title?: string;
    description?: string;
    teams: any[];
    pendingTeams: any[];
    authorizedTeams: any[];
    action: (...args: any[]) => any;
    withAllTeamSelector?: boolean;
    closeOnSelect?: boolean;
    allowMultipleDemand?: boolean;
};

function ActionWithTeamSelectorComponent(props: TActionWithTeamSelectorComponentProps) {
  const openTeamSelectorModal = () => {
    if (props.teams.length === 1) props.action([props.teams[0]._id]);
    else
      (props as any).openTeamSelectorModal({
    allTeamSelector: props.withAllTeamSelector,
    title: props.title,
    description: props.description,
    teams: props.teams,
    pendingTeams: props.pendingTeams,
    acceptedTeams: props.authorizedTeams,
    action: (teams: any) => props.action(teams),
    allowMultipleDemand: props.allowMultipleDemand,
});
  };

  if (
    !props.allowMultipleDemand &&
    props.teams.length === 1 &&
    (props.pendingTeams.includes(props.teams[0]._id) ||
      props.authorizedTeams.includes(props.teams[0]._id))
  ) {
    return null;
  }

    return <>{React.cloneElement((props as any).children, { onClick: () => openTeamSelectorModal() })}</>;
}

ActionWithTeamSelectorComponent.defaultProps = {
  pendingTeams: [],
  authorizedTeams: [],
};

const mapStateToProps = (state: any) => ({
  ...state.context
});

const mapDispatchToProps = {
  openTeamSelectorModal: (modalProps: any) => openTeamSelectorModal(modalProps),
};

export const ActionWithTeamSelector = connect(
  mapStateToProps,
  mapDispatchToProps
)(ActionWithTeamSelectorComponent);
