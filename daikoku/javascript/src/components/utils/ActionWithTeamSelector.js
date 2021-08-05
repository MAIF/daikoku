import React, { Component } from 'react';
import { PropTypes } from 'prop-types';
import { openTeamSelectorModal } from '../../core/modal';
import { connect } from 'react-redux';

class ActionWithTeamSelectorComponent extends Component {
  openTeamSelectorModal = () => {
    if (this.props.teams.length === 1)
      this.props.action([this.props.teams[0]._id])
    else
      this.props.openTeamSelectorModal({
        allTeamSelector: this.props.withAllTeamSelector,
        title: this.props.title,
        description: this.props.description,
        currentLanguage: this.props.currentLanguage,
        teams: this.props.teams,
        pendingTeams: this.props.pendingTeams,
        acceptedTeams: this.props.authorizedTeams,
        action: (teams) => this.props.action(teams),
        allowMultipleDemand: this.props.allowMultipleDemand,
      });
  };

  render() {
    if (
      !this.props.allowMultipleDemand &&
      this.props.teams.length === 1 &&
      (this.props.pendingTeams.includes(this.props.teams[0]._id) ||
        this.props.authorizedTeams.includes(this.props.teams[0]._id))
    ) {
      return null;
    }

    return (
      <>
        {React.cloneElement(this.props.children, { onClick: () => this.openTeamSelectorModal() })}
      </>
    );
  }
}

ActionWithTeamSelectorComponent.defaultProps = {
  pendingTeams: [],
  authorizedTeams: [],
};

ActionWithTeamSelectorComponent.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
  currentLanguage: PropTypes.string,
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
