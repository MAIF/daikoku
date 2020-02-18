import React, { Component } from 'react';
import { PropTypes } from 'prop-types';
import { closeModal, openModal } from '../../core/modal';
import { connect } from 'react-redux';

class ActionWithTeamSelectorComponent extends Component {
  openTeamSelectorModal = () => {
    this.props.openModal(
      {
        open: true,
        allTeamSelector: this.props.withAllTeamSelector,
        title: this.props.title,
        description: this.props.description,
        currentLanguage:this.props.currentLanguage,
        teams: this.props.teams,
        pendingTeams: this.props.pendingTeams,
        acceptedTeams: this.props.authorizedTeams,
        action: teams => this.props.action(teams),
        closeModal: this.props.closeModal,
        allowMultipleDemand: this.props.allowMultipleDemand,
      },
      'teamSelector'
    );
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

const mapDispatchToProps = {
  closeModal: () => closeModal(),
  openModal: (modalProps, modalType) => openModal({ modalProps, modalType }),
};

export const ActionWithTeamSelector = connect(
  null,
  mapDispatchToProps
)(ActionWithTeamSelectorComponent);
