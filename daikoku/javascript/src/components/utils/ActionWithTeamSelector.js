import React from 'react';
import { PropTypes } from 'prop-types';
import { openTeamSelectorModal } from '../../core/modal';
import { connect } from 'react-redux';

function ActionWithTeamSelectorComponent(props) {
  const openTeamSelectorModal = () => {
    if (props.teams.length === 1) props.action([props.teams[0]._id]);
    else
      props.openTeamSelectorModal({
        allTeamSelector: props.withAllTeamSelector,
        title: props.title,
        description: props.description,
        teams: props.teams,
        pendingTeams: props.pendingTeams,
        acceptedTeams: props.authorizedTeams,
        action: (teams) => props.action(teams),
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

  return <>{React.cloneElement(props.children, { onClick: () => openTeamSelectorModal() })}</>;
}

ActionWithTeamSelectorComponent.defaultProps = {
  pendingTeams: [],
  authorizedTeams: [],
};

ActionWithTeamSelectorComponent.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
  teams: PropTypes.array.isRequired,
  pendingTeams: PropTypes.array,
  authorizedTeams: PropTypes.array,
  action: PropTypes.func.isRequired,
  withAllTeamSelector: PropTypes.bool,
  closeOnSelect: PropTypes.bool,
  allowMultipleDemand: PropTypes.bool,
};

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  openTeamSelectorModal: (modalProps) => openTeamSelectorModal(modalProps),
};

export const ActionWithTeamSelector = connect(
  mapStateToProps,
  mapDispatchToProps
)(ActionWithTeamSelectorComponent);
